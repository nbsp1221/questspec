import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type AtomicOutputError,
  writeDirectoryAtomic,
} from '../../src/filesystem/atomic-output.ts';

describe('atomic directory output', () => {
  it('refuses to overwrite an existing destination by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'questspec-atomic-'));
    const destination = join(root, 'quests');
    await writeDirectoryAtomic(new Map([['old.snbt', 'old']]), destination);

    await expect(writeDirectoryAtomic(new Map([['new.snbt', 'new']]), destination)).rejects.toEqual(
      expect.objectContaining<Partial<AtomicOutputError>>({ code: 'OUTPUT_EXISTS' }),
    );
    await expect(readFile(join(destination, 'old.snbt'), 'utf8')).resolves.toBe('old');
  });

  it('atomically replaces a destination when explicitly allowed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'questspec-atomic-'));
    const destination = join(root, 'quests');
    await writeDirectoryAtomic(new Map([['old.snbt', 'old']]), destination);
    await writeDirectoryAtomic(new Map([['nested/new.snbt', 'new']]), destination, {
      overwrite: true,
    });

    await expect(readFile(join(destination, 'nested/new.snbt'), 'utf8')).resolves.toBe('new');
    await expect(readFile(join(destination, 'old.snbt'), 'utf8')).rejects.toThrow();
  });

  it('rejects unsafe generated paths before touching the destination', async () => {
    const root = await mkdtemp(join(tmpdir(), 'questspec-atomic-'));
    const destination = join(root, 'quests');
    await writeDirectoryAtomic(new Map([['existing.snbt', 'safe']]), destination);
    await writeFile(join(root, 'outside.snbt'), 'outside');

    await expect(
      writeDirectoryAtomic(new Map([['../outside.snbt', 'changed']]), destination, {
        overwrite: true,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AtomicOutputError>>({ code: 'OUTPUT_UNSAFE_PATH' }),
    );
    await expect(readFile(join(destination, 'existing.snbt'), 'utf8')).resolves.toBe('safe');
    await expect(readFile(join(root, 'outside.snbt'), 'utf8')).resolves.toBe('outside');
  });
});
