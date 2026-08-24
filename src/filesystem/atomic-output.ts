import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix } from 'node:path';

export type AtomicOutputErrorCode = 'OUTPUT_EXISTS' | 'OUTPUT_UNSAFE_PATH';

export class AtomicOutputError extends Error {
  readonly code: AtomicOutputErrorCode;

  constructor(code: AtomicOutputErrorCode, message: string) {
    super(message);
    this.name = 'AtomicOutputError';
    this.code = code;
  }
}

export interface AtomicOutputOptions {
  overwrite?: boolean;
}

export async function writeDirectoryAtomic(
  files: ReadonlyMap<string, string>,
  destination: string,
  options: AtomicOutputOptions = {},
): Promise<void> {
  const paths = [...files.keys()];
  for (const path of paths) {
    assertSafeRelativePath(path);
  }

  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const destinationExists = await exists(destination);
  if (destinationExists && !options.overwrite) {
    throw new AtomicOutputError(
      'OUTPUT_EXISTS',
      `Output destination already exists: ${destination}`,
    );
  }

  const staging = await mkdtemp(join(parent, `.${basename(destination)}.questspec-`));
  let stagingExists = true;
  let backup: string | undefined;
  try {
    for (const [path, source] of files) {
      const outputPath = join(staging, ...path.split('/'));
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, source, 'utf8');
    }

    if (destinationExists) {
      backup = join(parent, `.${basename(destination)}.questspec-backup-${randomUUID()}`);
      await rename(destination, backup);
    }
    try {
      await rename(staging, destination);
      stagingExists = false;
    } catch (error) {
      if (backup !== undefined) {
        await rename(backup, destination);
        backup = undefined;
      }
      throw error;
    }
    if (backup !== undefined) {
      await rm(backup, { force: true, recursive: true });
      backup = undefined;
    }
  } finally {
    if (stagingExists) {
      await rm(staging, { force: true, recursive: true });
    }
  }
}

export async function writeFileAtomic(
  destination: string,
  contents: string,
  options: AtomicOutputOptions = {},
): Promise<void> {
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  if ((await exists(destination)) && !options.overwrite) {
    throw new AtomicOutputError(
      'OUTPUT_EXISTS',
      `Output destination already exists: ${destination}`,
    );
  }
  const staging = join(parent, `.${basename(destination)}.questspec-${randomUUID()}`);
  try {
    await writeFile(staging, contents, 'utf8');
    await rename(staging, destination);
  } finally {
    await rm(staging, { force: true });
  }
}

export async function writeFileSetAtomic(
  files: ReadonlyMap<string, string>,
  options: AtomicOutputOptions = {},
): Promise<void> {
  const records = await Promise.all(
    [...files].map(async ([target, contents]) => {
      const targetExists = await exists(target);
      if (targetExists && !options.overwrite) {
        throw new AtomicOutputError(
          'OUTPUT_EXISTS',
          `Output destination already exists: ${target}`,
        );
      }
      const parent = dirname(target);
      await mkdir(parent, { recursive: true });
      return {
        backup: undefined as string | undefined,
        contents,
        installed: false,
        staging: join(parent, `.${basename(target)}.questspec-${randomUUID()}`),
        target,
        targetExists,
      };
    }),
  );

  try {
    await Promise.all(records.map((record) => writeFile(record.staging, record.contents, 'utf8')));
    for (const record of records) {
      if (record.targetExists) {
        record.backup = `${record.staging}.backup`;
        await rename(record.target, record.backup);
      }
    }
    for (const record of records) {
      await rename(record.staging, record.target);
      record.installed = true;
    }
    await Promise.all(
      records.map((record) =>
        record.backup === undefined ? Promise.resolve() : rm(record.backup, { force: true }),
      ),
    );
  } catch (error) {
    for (const record of [...records].reverse()) {
      if (record.installed) {
        await rm(record.target, { force: true });
      }
      if (record.backup !== undefined && (await exists(record.backup))) {
        await rename(record.backup, record.target);
      }
    }
    throw error;
  } finally {
    await Promise.all(
      records.flatMap((record) => [
        rm(record.staging, { force: true }),
        record.backup === undefined ? Promise.resolve() : rm(record.backup, { force: true }),
      ]),
    );
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function assertSafeRelativePath(path: string): void {
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    path.includes('\\') ||
    posix.normalize(path) !== path ||
    path.split('/').includes('..')
  ) {
    throw new AtomicOutputError('OUTPUT_UNSAFE_PATH', `Unsafe generated output path: ${path}`);
  }
}
