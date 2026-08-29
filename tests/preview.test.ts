import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSnbtDirectory } from '../src/filesystem/read-directory.ts';
import { type QuestPreview, buildQuestPreview } from '../src/preview/model.ts';
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
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(response.headers.get('content-security-policy')).not.toContain("'unsafe-inline'");
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(html).toContain('QuestSpec Preview');
      expect(html).toContain('href="/assets/app.css"');
      expect(html).toContain('src="/assets/app.js"');

      const previewResponse = await fetch(new URL('/preview.json', preview.url));
      expect(previewResponse.headers.get('content-type')).toBe('application/json; charset=utf-8');
      const previewData = (await previewResponse.json()) as QuestPreview;
      expect(previewData.locales.en_us?.chapters[0]?.quests[0]?.title).toBe('Punch a Tree');
      const javascript = await fetch(new URL('/assets/app.js', preview.url));
      const stylesheet = await fetch(new URL('/assets/app.css', preview.url));
      expect(javascript.status).toBe(200);
      expect(javascript.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
      expect((await javascript.text()).length).toBeGreaterThan(10_000);
      expect(stylesheet.status).toBe(200);
      expect(stylesheet.headers.get('content-type')).toBe('text/css; charset=utf-8');
      expect(await stylesheet.text()).toContain('--graphite-950');

      const head = await fetch(preview.url, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
      expect((await fetch(new URL('/health', preview.url))).status).toBe(200);
      expect((await fetch(new URL('/missing', preview.url))).status).toBe(404);
      const rejected = await fetch(preview.url, { method: 'POST' });
      expect(rejected.status).toBe(405);
      expect(rejected.headers.get('allow')).toBe('GET, HEAD');
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
