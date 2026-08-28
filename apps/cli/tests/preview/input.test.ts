import { mkdir, mkdtemp, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PreviewInputError,
  capturePreviewInput,
  capturePreviewInputPair,
} from '../../src/preview/input.ts';

async function temporaryRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'questspec-preview-input-'));
}

describe('preview safe input capture', () => {
  it('captures through a stable handle and derives stable pair identities without paths', async () => {
    const root = await temporaryRoot();
    const source = join(root, 'quests.yml');
    const catalog = join(root, 'resources.json');
    await writeFile(source, 'questspec: 1\n');
    await writeFile(catalog, '{}\n');

    const first = await capturePreviewInputPair(source, catalog);
    const second = await capturePreviewInputPair(source, catalog);
    expect(first.inputIdentity).toBe(second.inputIdentity);
    expect(first.source.status).toBe('fulfilled');
    if (first.source.status !== 'fulfilled') {
      throw first.source.reason;
    }
    expect(new TextDecoder().decode(first.source.value.bytes)).toBe('questspec: 1\n');
    expect(first.inputIdentity).not.toContain(root);

    await writeFile(source, 'questspec: 2\n');
    expect((await capturePreviewInputPair(source, catalog)).inputIdentity).not.toBe(
      first.inputIdentity,
    );
  });

  it('rejects symlinks, directories, and actual bytes beyond the configured bound', async () => {
    const root = await temporaryRoot();
    const file = join(root, 'file.yml');
    const link = join(root, 'link.yml');
    const directory = join(root, 'directory');
    await writeFile(file, '12345');
    await symlink(file, link);
    await mkdir(directory);

    await expect(capturePreviewInput(link, 'source', { attempts: 1 })).rejects.toMatchObject({
      code: 'INPUT_SYMLINK',
    });
    await expect(capturePreviewInput(directory, 'source', { attempts: 1 })).rejects.toMatchObject({
      code: 'INPUT_NOT_REGULAR',
    });
    await expect(
      capturePreviewInput(file, 'source', { attempts: 1, maximumBytes: 4 }),
    ).rejects.toMatchObject({ code: 'INPUT_OVERSIZED' });
  });

  it('fails closed when a verified path is atomically replaced by a different inode', async () => {
    const root = await temporaryRoot();
    const file = join(root, 'quests.yml');
    const replacement = join(root, 'replacement.yml');
    await writeFile(file, 'old');
    await writeFile(replacement, 'new');

    await expect(
      capturePreviewInput(file, 'source', {
        attempts: 1,
        hooks: { afterOpen: () => rename(replacement, file) },
      }),
    ).rejects.toMatchObject({ code: 'INPUT_CHANGED' });
  });

  it('retries a transient inode replacement and captures only the stable replacement', async () => {
    const root = await temporaryRoot();
    const file = join(root, 'quests.yml');
    const replacement = join(root, 'replacement.yml');
    await writeFile(file, 'old');
    await writeFile(replacement, 'stable replacement');

    const captured = await capturePreviewInput(file, 'source', {
      attempts: 2,
      hooks: {
        afterOpen: (_kind, attempt) =>
          attempt === 1 ? rename(replacement, file) : Promise.resolve(),
      },
    });
    expect(new TextDecoder().decode(captured.bytes)).toBe('stable replacement');
  });

  it('discards bytes when the opened inode mutates during the controlled read barrier', async () => {
    const root = await temporaryRoot();
    const file = join(root, 'quests.yml');
    await writeFile(file, 'before');

    let error: unknown;
    try {
      await capturePreviewInput(file, 'source', {
        attempts: 1,
        hooks: { beforeRead: () => writeFile(file, 'after mutation with a different size') },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PreviewInputError);
    expect(error).toMatchObject({ code: 'INPUT_CHANGED' });
  });

  it.each([
    { initial: 'new', replacement: 'old' },
    { initial: 'old', replacement: 'new' },
  ])(
    'retries the whole pair instead of returning source-$initial/catalog-$replacement',
    async ({ initial, replacement }) => {
      const root = await temporaryRoot();
      const source = join(root, 'quests.yml');
      const catalog = join(root, 'resources.json');
      await writeFile(source, `source-${initial}`);
      await writeFile(catalog, `catalog-${initial}`);

      const pair = await capturePreviewInputPair(source, catalog, {
        attempts: 2,
        hooks: {
          afterCapture: async (kind, attempt) => {
            if (kind === 'source' && attempt === 1) {
              const nextSource = join(root, 'next-quests.yml');
              const nextCatalog = join(root, 'next-resources.json');
              await writeFile(nextSource, `source-${replacement}`);
              await writeFile(nextCatalog, `catalog-${replacement}`);
              await rename(nextSource, source);
              await rename(nextCatalog, catalog);
            }
          },
        },
      });

      expect(pair.source.status).toBe('fulfilled');
      expect(pair.catalog?.status).toBe('fulfilled');
      if (pair.source.status !== 'fulfilled' || pair.catalog?.status !== 'fulfilled') {
        return;
      }
      expect(new TextDecoder().decode(pair.source.value.bytes)).toBe(`source-${replacement}`);
      expect(new TextDecoder().decode(pair.catalog.value.bytes)).toBe(`catalog-${replacement}`);
    },
  );

  it('fails closed on a regular-to-symlink swap between pre-lstat and open', async () => {
    const root = await temporaryRoot();
    const file = join(root, 'quests.yml');
    const original = join(root, 'original.yml');
    const target = join(root, 'target.yml');
    await writeFile(file, 'original');
    await writeFile(target, 'symlink target');

    let error: unknown;
    try {
      await capturePreviewInput(file, 'source', {
        attempts: 1,
        hooks: {
          afterPreStat: async () => {
            await rename(file, original);
            await symlink(target, file);
          },
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PreviewInputError);
    expect(['INPUT_CHANGED', 'INPUT_SYMLINK']).toContain((error as PreviewInputError).code);
  });
});
