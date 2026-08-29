import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { readSnbtDirectory } from '../src/filesystem/read-directory.ts';
import { buildQuestPreview } from '../src/preview/model.ts';
import { startPreviewServer } from '../src/preview/server.ts';

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'questspec-preview-'));
  await mkdir(join(root, 'chapters'));
  await mkdir(join(root, 'lang'));
  await writeFile(join(root, 'data.snbt'), '{ version: 13 }');
  await writeFile(
    join(root, 'chapter_groups.snbt'),
    '{ chapter_groups: [{ id: "A", order_index: 0 }] }',
  );
  await writeFile(
    join(root, 'chapters', 'start.snbt'),
    `{
      id: "B"
      group: "A"
      filename: "start"
      icon: "minecraft:book"
      quests: [
        { id: "Q1", x: 0.0d, y: 1.0d, shape: "diamond", tasks: [{ id: "T1", type: "item", item: "minecraft:oak_log" }] }
        { id: "Q2", x: 2.0d, y: 1.0d, dependencies: ["Q1"], optional: true, rewards: [{ id: "R1", type: "xp", xp: 10 }] }
      ]
    }`,
  );
  await writeFile(
    join(root, 'lang', 'en_us.snbt'),
    `{
      chapter_group.A.title: "Getting Started"
      chapter.B.title: "First Steps"
      quest.Q1.title: "Punch a Tree"
      quest.Q1.quest_desc: ["Collect your first log."]
      quest.Q2.title: "Level Up"
    }`,
  );
  return root;
}

describe('FTB Quests browser preview', () => {
  it('builds a localized visual model directly from an SNBT directory', async () => {
    const root = await fixture();
    const preview = buildQuestPreview(root, await readSnbtDirectory(root));

    expect(preview.selectedLocale).toBe('en_us');
    expect(preview.stats).toEqual({ chapters: 1, dependencies: 1, groups: 1, quests: 2 });
    expect(preview.locales.en_us.groups[0].title).toBe('Getting Started');
    expect(preview.locales.en_us.chapters[0]).toMatchObject({
      icon: 'minecraft:book',
      title: 'First Steps',
      quests: [
        {
          description: ['Collect your first log.'],
          icon: 'minecraft:oak_log',
          shape: 'diamond',
          title: 'Punch a Tree',
          x: 0,
          y: 1,
        },
        { dependencies: ['Q1'], optional: true, title: 'Level Up' },
      ],
    });
  });

  it('serves a self-contained read-only UI on loopback without changing the input', async () => {
    const root = await fixture();
    const before = await Promise.all([
      readFile(join(root, 'chapters', 'start.snbt'), 'utf8'),
      stat(join(root, 'chapters', 'start.snbt')).then((value) => value.mtimeMs),
    ]);
    const preview = await startPreviewServer(root);
    try {
      expect(preview.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/u);
      const response = await fetch(preview.url);
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(html).toContain('QuestSpec Preview');
      expect(html).toContain('Punch a Tree');
      expect(html).toContain('Quest dependency graph');
      const script = html.split('<script>')[1]?.split('</script>')[0];
      expect(script).toBeDefined();
      expect(() => new Script(script)).not.toThrow();
      expect((await fetch(new URL('/health', preview.url))).status).toBe(200);
      expect((await fetch(new URL('/missing', preview.url))).status).toBe(404);
    } finally {
      await preview.close();
    }
    const after = await Promise.all([
      readFile(join(root, 'chapters', 'start.snbt'), 'utf8'),
      stat(join(root, 'chapters', 'start.snbt')).then((value) => value.mtimeMs),
    ]);
    expect(after).toEqual(before);
  });
});
