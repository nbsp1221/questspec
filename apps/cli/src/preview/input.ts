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
  readonly catalog?: CapturedPreviewInput;
  readonly inputIdentity: string;
  readonly source: CapturedPreviewInput;
}

interface ComparableStatus {
  readonly ctimeNs: bigint;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly mtimeNs: bigint;
  readonly size: bigint;
}

export interface PreviewInputHooks {
  readonly afterOpen?: (kind: PreviewInputKind, attempt: number) => Promise<void> | void;
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
  const source = await capturePreviewInput(sourcePath, 'source', options);
  const catalog =
    catalogPath === undefined
      ? undefined
      : await capturePreviewInput(catalogPath, 'catalog', options);
  const hash = createHash('sha256');
  hash.update('questspec-preview-input-v1\0source\0');
  hash.update(source.identity);
  if (catalog === undefined) {
    hash.update('\0catalog:not-requested');
  } else {
    hash.update('\0catalog\0');
    hash.update(catalog.identity);
  }
  return Object.freeze({ catalog, inputIdentity: hash.digest('hex'), source });
}

export async function capturePreviewInput(
  path: string,
  kind: PreviewInputKind,
  options: CapturePreviewInputOptions = {},
): Promise<CapturedPreviewInput> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const maximumBytes = options.maximumBytes ?? MAX_PREVIEW_INPUT_BYTES;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new TypeError('Preview input attempts must be an integer from 1 through 10');
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new TypeError('Preview input maximum bytes must be a non-negative safe integer');
  }

  let lastError: PreviewInputError | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await captureAttempt(path, kind, maximumBytes, attempt, options.hooks);
    } catch (error) {
      lastError = normalizeInputError(error, kind);
      if (attempt < attempts) {
        await delay(attempt * 10);
      }
    }
  }
  throw lastError!;
}

async function captureAttempt(
  path: string,
  kind: PreviewInputKind,
  maximumBytes: number,
  attempt: number,
  hooks: PreviewInputHooks | undefined,
): Promise<CapturedPreviewInput> {
  let handle: FileHandle | undefined;
  try {
    const pre = await lstat(path, { bigint: true });
    requireRegular(pre, kind);
    const preStatus = comparableStatus(pre, kind);
    if (preStatus.size > BigInt(maximumBytes)) {
      throw inputError('INPUT_OVERSIZED', kind, `The ${kind} exceeds the 16 MiB limit`);
    }

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
    return Object.freeze({ bytes, identity: hash.digest('hex'), kind });
  } finally {
    await handle?.close().catch(() => undefined);
  }
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
