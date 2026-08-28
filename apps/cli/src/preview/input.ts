import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, lstat, open } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
export const MAX_PREVIEW_INPUT_BYTES = 16 * 1024 * 1024;
const DEFAULT_ATTEMPTS = 3;
const READ_CHUNK_BYTES = 64 * 1024;

export type PreviewInputKind = 'catalog' | 'source';

export type PreviewInputErrorCode =
  | 'INPUT_CHANGED'
  | 'INPUT_IDENTITY_UNSUPPORTED'
  | 'INPUT_NOT_REGULAR'
  | 'INPUT_NOT_READABLE'
  | 'INPUT_OVERSIZED'
  | 'INPUT_SYMLINK';

export class PreviewInputError extends Error {
  override readonly name = 'PreviewInputError';
  readonly code: PreviewInputErrorCode;
  readonly kind: PreviewInputKind;

  constructor(
    code: PreviewInputErrorCode,
    kind: PreviewInputKind,
    message: string,
    options: ErrorOptions = {},
  ) {
    super(message, options);
    this.code = code;
    this.kind = kind;
  }
}

export interface CapturedPreviewInput {
  readonly bytes: Uint8Array;
  readonly identity: string;
  readonly kind: PreviewInputKind;
}

export interface CapturedPreviewInputPair {
  readonly catalog: PromiseSettledResult<CapturedPreviewInput> | undefined;
  readonly inputIdentity: string;
  readonly source: PromiseSettledResult<CapturedPreviewInput>;
}

interface ComparableStatus {
  readonly ctimeNs: bigint;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly mtimeNs: bigint;
  readonly size: bigint;
}

interface CapturedAttempt {
  readonly input: CapturedPreviewInput;
  readonly status: ComparableStatus;
}

type PathSnapshot =
  | { readonly kind: 'available'; readonly status: ComparableStatus }
  | { readonly error: PreviewInputError; readonly kind: 'unavailable' };

export interface PreviewInputHooks {
  readonly afterCapture?: (kind: PreviewInputKind, attempt: number) => Promise<void> | void;
  readonly afterOpen?: (kind: PreviewInputKind, attempt: number) => Promise<void> | void;
  readonly afterPairCapture?: (attempt: number) => Promise<void> | void;
  readonly afterPreStat?: (kind: PreviewInputKind, attempt: number) => Promise<void> | void;
  readonly beforeRead?: (kind: PreviewInputKind, attempt: number) => Promise<void> | void;
}

export interface CapturePreviewInputOptions {
  readonly attempts?: number;
  readonly hooks?: PreviewInputHooks;
  readonly maximumBytes?: number;
}

export async function capturePreviewInputPair(
  sourcePath: string,
  catalogPath?: string,
  options: CapturePreviewInputOptions = {},
): Promise<CapturedPreviewInputPair> {
  const { attempts, maximumBytes } = validatedOptions(options);
  let lastPair: CapturedPreviewInputPair | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const paths = requestedPaths(sourcePath, catalogPath);
    const before = await snapshotPaths(paths);
    const source = await settleCapture(sourcePath, 'source', maximumBytes, attempt, options.hooks);
    await options.hooks?.afterCapture?.('source', attempt);
    const catalog =
      catalogPath === undefined
        ? undefined
        : await settleCapture(catalogPath, 'catalog', maximumBytes, attempt, options.hooks);
    if (catalog !== undefined) {
      await options.hooks?.afterCapture?.('catalog', attempt);
    }
    await options.hooks?.afterPairCapture?.(attempt);
    const after = await snapshotPaths(paths);

    if (!samePathSnapshots(before, after) || !capturesMatchSnapshots(source, catalog, after)) {
      lastPair = changedPair(catalog !== undefined);
    } else {
      return createPair(source, catalog);
    }
    if (attempt < attempts) {
      await delay(attempt * 10);
    }
  }
  return lastPair!;
}

export async function capturePreviewInput(
  path: string,
  kind: PreviewInputKind,
  options: CapturePreviewInputOptions = {},
): Promise<CapturedPreviewInput> {
  const { attempts, maximumBytes } = validatedOptions(options);
  let lastError: PreviewInputError | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return (await captureAttempt(path, kind, maximumBytes, attempt, options.hooks)).input;
    } catch (error) {
      lastError = normalizeInputError(error, kind);
      if (attempt < attempts) {
        await delay(attempt * 10);
      }
    }
  }
  throw lastError!;
}

function validatedOptions(options: CapturePreviewInputOptions): {
  attempts: number;
  maximumBytes: number;
} {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const maximumBytes = options.maximumBytes ?? MAX_PREVIEW_INPUT_BYTES;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new TypeError('Preview input attempts must be an integer from 1 through 10');
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new TypeError('Preview input maximum bytes must be a non-negative safe integer');
  }
  return { attempts, maximumBytes };
}

async function settleCapture(
  path: string,
  kind: PreviewInputKind,
  maximumBytes: number,
  attempt: number,
  hooks: PreviewInputHooks | undefined,
): Promise<PromiseSettledResult<CapturedAttempt>> {
  try {
    return {
      status: 'fulfilled',
      value: await captureAttempt(path, kind, maximumBytes, attempt, hooks),
    };
  } catch (error) {
    return { reason: normalizeInputError(error, kind), status: 'rejected' };
  }
}

async function captureAttempt(
  path: string,
  kind: PreviewInputKind,
  maximumBytes: number,
  attempt: number,
  hooks: PreviewInputHooks | undefined,
): Promise<CapturedAttempt> {
  let handle: FileHandle | undefined;
  try {
    const pre = await lstat(path, { bigint: true });
    requireRegular(pre, kind);
    const preStatus = comparableStatus(pre, kind);
    if (preStatus.size > BigInt(maximumBytes)) {
      throw inputError('INPUT_OVERSIZED', kind, `The ${kind} exceeds the 16 MiB limit`);
    }

    await hooks?.afterPreStat?.(kind, attempt);
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
    handle = await open(path, constants.O_RDONLY | noFollow);
    await hooks?.afterOpen?.(kind, attempt);
    const opened = await handle.stat({ bigint: true });
    const postOpen = await lstat(path, { bigint: true });
    requireRegular(opened, kind);
    requireRegular(postOpen, kind);
    const openedStatus = comparableStatus(opened, kind);
    const postOpenStatus = comparableStatus(postOpen, kind);
    if (!sameStatus(preStatus, openedStatus) || !sameStatus(openedStatus, postOpenStatus)) {
      throw inputError('INPUT_CHANGED', kind, `The ${kind} changed while it was opened`);
    }

    await hooks?.beforeRead?.(kind, attempt);
    const bytes = await readBounded(handle, maximumBytes, kind);
    const afterRead = comparableStatus(await handle.stat({ bigint: true }), kind);
    const postRead = await lstat(path, { bigint: true });
    requireRegular(postRead, kind);
    const postReadStatus = comparableStatus(postRead, kind);
    if (!sameStatus(openedStatus, afterRead) || !sameStatus(afterRead, postReadStatus)) {
      throw inputError('INPUT_CHANGED', kind, `The ${kind} changed while it was read`);
    }

    const hash = createHash('sha256');
    hash.update(`questspec-preview-file-v1\0${kind}\0${afterRead.mode}\0`);
    hash.update(bytes);
    return {
      input: Object.freeze({ bytes, identity: hash.digest('hex'), kind }),
      status: afterRead,
    };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function requestedPaths(sourcePath: string, catalogPath: string | undefined) {
  return catalogPath === undefined
    ? ([['source', sourcePath]] as const)
    : ([
        ['source', sourcePath],
        ['catalog', catalogPath],
      ] as const);
}

async function snapshotPaths(
  paths: readonly (readonly [PreviewInputKind, string])[],
): Promise<ReadonlyMap<PreviewInputKind, PathSnapshot>> {
  const snapshots = new Map<PreviewInputKind, PathSnapshot>();
  await Promise.all(
    paths.map(async ([kind, path]) => {
      try {
        const status = await lstat(path, { bigint: true });
        requireRegular(status, kind);
        snapshots.set(kind, { kind: 'available', status: comparableStatus(status, kind) });
      } catch (error) {
        snapshots.set(kind, { error: normalizeInputError(error, kind), kind: 'unavailable' });
      }
    }),
  );
  return snapshots;
}

function samePathSnapshots(
  before: ReadonlyMap<PreviewInputKind, PathSnapshot>,
  after: ReadonlyMap<PreviewInputKind, PathSnapshot>,
): boolean {
  for (const kind of before.keys()) {
    const left = before.get(kind)!;
    const right = after.get(kind);
    if (right === undefined || left.kind !== right.kind) {
      return false;
    }
    if (left.kind === 'available' && right.kind === 'available') {
      if (!sameStatus(left.status, right.status)) {
        return false;
      }
    } else if (left.kind === 'unavailable' && right.kind === 'unavailable') {
      if (left.error.code !== right.error.code) {
        return false;
      }
    }
  }
  return true;
}

function capturesMatchSnapshots(
  source: PromiseSettledResult<CapturedAttempt>,
  catalog: PromiseSettledResult<CapturedAttempt> | undefined,
  snapshots: ReadonlyMap<PreviewInputKind, PathSnapshot>,
): boolean {
  return (
    captureMatchesSnapshot(source, snapshots.get('source')!) &&
    (catalog === undefined || captureMatchesSnapshot(catalog, snapshots.get('catalog')!))
  );
}

function captureMatchesSnapshot(
  capture: PromiseSettledResult<CapturedAttempt>,
  snapshot: PathSnapshot,
): boolean {
  if (capture.status === 'fulfilled') {
    return snapshot.kind === 'available' && sameStatus(capture.value.status, snapshot.status);
  }
  return (
    snapshot.kind === 'unavailable' &&
    normalizeInputError(capture.reason, snapshot.error.kind).code === snapshot.error.code
  );
}

function changedPair(catalogRequested: boolean): CapturedPreviewInputPair {
  const changed = (kind: PreviewInputKind): PromiseRejectedResult => ({
    reason: inputError(
      'INPUT_CHANGED',
      kind,
      `The ${kind} changed while the input pair was captured`,
    ),
    status: 'rejected',
  });

  return createPair(changed('source'), catalogRequested ? changed('catalog') : undefined);
}

function createPair(
  source: PromiseSettledResult<CapturedAttempt> | PromiseRejectedResult,
  catalog: PromiseSettledResult<CapturedAttempt> | PromiseRejectedResult | undefined,
): CapturedPreviewInputPair {
  const project = (
    result: PromiseSettledResult<CapturedAttempt> | PromiseRejectedResult,
  ): PromiseSettledResult<CapturedPreviewInput> =>
    result.status === 'fulfilled' ? { status: 'fulfilled', value: result.value.input } : result;

  const projectedSource = project(source);
  const projectedCatalog = catalog === undefined ? undefined : project(catalog);
  const hash = createHash('sha256');
  hash.update('questspec-preview-input-v2\0source\0');
  hash.update(resultIdentity(projectedSource));
  hash.update('\0catalog\0');
  hash.update(projectedCatalog === undefined ? 'not-requested' : resultIdentity(projectedCatalog));
  return Object.freeze({
    catalog: projectedCatalog,
    inputIdentity: hash.digest('hex'),
    source: projectedSource,
  });
}

function resultIdentity(result: PromiseSettledResult<CapturedPreviewInput>): string {
  if (result.status === 'fulfilled') {
    return result.value.identity;
  }
  const error = result.reason as unknown;
  return error instanceof PreviewInputError
    ? `unavailable:${error.kind}:${error.code}`
    : 'unavailable';
}

async function readBounded(
  handle: FileHandle,
  maximumBytes: number,
  kind: PreviewInputKind,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const remaining = maximumBytes + 1 - total;
    if (remaining <= 0) {
      throw inputError('INPUT_OVERSIZED', kind, `The ${kind} exceeds the 16 MiB limit`);
    }
    const buffer = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, remaining));
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null);
    if (bytesRead === 0) {
      break;
    }
    total += bytesRead;
    if (total > maximumBytes) {
      throw inputError('INPUT_OVERSIZED', kind, `The ${kind} exceeds the 16 MiB limit`);
    }
    chunks.push(buffer.subarray(0, bytesRead));
  }
  return Uint8Array.from(Buffer.concat(chunks, total));
}

function requireRegular(status: BigIntStats, kind: PreviewInputKind): void {
  if (status.isSymbolicLink()) {
    throw inputError('INPUT_SYMLINK', kind, `The ${kind} must not be a symbolic link`);
  }
  if (!status.isFile()) {
    throw inputError('INPUT_NOT_REGULAR', kind, `The ${kind} must be a regular file`);
  }
}

function comparableStatus(status: BigIntStats, kind: PreviewInputKind): ComparableStatus {
  const values = [status.dev, status.ino, status.mode, status.size, status.mtimeNs, status.ctimeNs];
  if (values.some((value) => typeof value !== 'bigint') || status.ino <= 0n || status.dev < 0n) {
    throw inputError(
      'INPUT_IDENTITY_UNSUPPORTED',
      kind,
      `The ${kind} filesystem does not expose a stable file identity`,
    );
  }
  return {
    ctimeNs: status.ctimeNs,
    dev: status.dev,
    ino: status.ino,
    mode: status.mode,
    mtimeNs: status.mtimeNs,
    size: status.size,
  };
}

function sameStatus(left: ComparableStatus, right: ComparableStatus): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function inputError(
  code: PreviewInputErrorCode,
  kind: PreviewInputKind,
  message: string,
  cause?: unknown,
): PreviewInputError {
  return new PreviewInputError(code, kind, message, cause === undefined ? {} : { cause });
}

function normalizeInputError(error: unknown, kind: PreviewInputKind): PreviewInputError {
  if (error instanceof PreviewInputError) {
    return error;
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ELOOP') {
    return inputError('INPUT_SYMLINK', kind, `The ${kind} must not be a symbolic link`, error);
  }
  return inputError('INPUT_NOT_READABLE', kind, `The ${kind} is missing or unreadable`, error);
}
