import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PreviewInputError } from '../../src/preview/input.ts';
import { PreviewLoader } from '../../src/preview/loader.ts';

const source = `questspec: 1
target:
  minecraft: 1.21.1
  loader: neoforge@21.1.248
  questSystem: ftbquests@2101.1.33
  serializer: ftblibrary@2101.1.35
  dataVersion: 13
locales:
  default: en_us
  supported: [en_us]
groups:
  - key: group
chapters:
  - key: chapter
    group: group
    filename: chapter
    title: {en_us: Chapter}
    icon: minecraft:book
    quests:
      - key: start
        title: {en_us: Start}
        x: 0
        y: 0
        tasks:
          - key: check
            type: checkmark
`;

const exactCatalog = JSON.stringify({
  advancements: {},
  items: [],
  target: {
    dataVersion: 13,
    loader: 'neoforge@21.1.248',
    minecraft: '1.21.1',
    questSystem: 'ftbquests@2101.1.33',
    serializer: 'ftblibrary@2101.1.35',
  },
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'questspec-preview-loader-'));
  const sourcePath = join(root, 'quests.yml');
  const catalogPath = join(root, 'resources.json');
  await writeFile(sourcePath, source);
  await writeFile(catalogPath, exactCatalog);
  return { catalogPath, root, sourcePath };
}

function request(phase: 'runtime' | 'startup', catalogRequested = true) {
  return { catalogRequested, phase, revision: 1 } as const;
}

describe('preview loader', () => {
  it('uses loadQuestbook, projects provenance, and applies current resource diagnostics', async () => {
    const paths = await fixture();
    const loader = new PreviewLoader(paths);
    const result = await loader.evaluate(request('startup'));

    expect(result.source.kind).toBe('normalized');
    expect(result.catalog).toMatchObject({ kind: 'current' });
    if (result.source.kind === 'normalized' && result.catalog.kind === 'current') {
      expect(result.source.model.chapters[0].quests[0].key).toBe('chapter.start');
      expect(result.source.provenanceByInstanceId['chapters/0/quests/0']).toBeDefined();
      expect(result.catalog.diagnostics).toEqual([
        expect.objectContaining({ code: 'RESOURCE_UNKNOWN_ITEM', displayFile: 'quests.yml' }),
      ]);
    }
    expect(JSON.stringify(result)).not.toContain(paths.root);
  });

  it('serves malformed source and malformed/profile-mismatched catalogs as repairable state', async () => {
    const paths = await fixture();
    await writeFile(paths.sourcePath, 'questspec: [');
    await writeFile(paths.catalogPath, '{');
    const result = await new PreviewLoader(paths).evaluate(request('startup'));

    expect(result.source).toMatchObject({ kind: 'not-normalizable' });
    expect(result.catalog).toMatchObject({ kind: 'unavailable' });
    if (result.catalog.kind === 'unavailable') {
      expect(result.catalog.notices[0].code).toBe('RESOURCE_CATALOG_INVALID');
    }
  });

  it('throws typed startup file-status failures but converts the same runtime failure to unavailable', async () => {
    const paths = await fixture();
    const loader = new PreviewLoader(paths);
    await rm(paths.catalogPath);

    await expect(loader.evaluate(request('startup'))).rejects.toBeInstanceOf(PreviewInputError);
    const runtime = await loader.evaluate(request('runtime'));
    expect(runtime.source.kind).toBe('normalized');
    expect(runtime.catalog).toMatchObject({ kind: 'unavailable' });
  });

  it('keeps identities stable for byte/status-identical captures and changes them after edits', async () => {
    const paths = await fixture();
    const loader = new PreviewLoader(paths);
    const first = await loader.evaluate(request('startup'));
    const second = await loader.evaluate(request('runtime'));
    expect(second.inputIdentity).toBe(first.inputIdentity);

    await writeFile(paths.sourcePath, source.replace('Start}', 'Changed}'));
    expect((await loader.evaluate(request('runtime'))).inputIdentity).not.toBe(first.inputIdentity);
  });
});
