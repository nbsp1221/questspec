import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSnbtDirectory } from '../src/filesystem/read-directory.ts';
import { type QuestPreview, buildQuestPreview } from '../src/preview/model.ts';
import { startPreviewServer } from '../src/preview/server.ts';

function authoredStylesheet(file: string): string {
  return readFileSync(new URL(`../src/preview/client/${file}`, import.meta.url), 'utf8');
}

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
      // The theme bootstrap must block first paint, ahead of the deferred app.
      expect(html).toContain('<script src="/assets/theme.js"></script>');
      expect(html.indexOf('/assets/theme.js')).toBeLessThan(html.indexOf('/assets/app.js'));
      expect(html).toContain('content="light dark"');

      const previewResponse = await fetch(new URL('/preview.json', preview.url));
      expect(previewResponse.headers.get('content-type')).toBe('application/json; charset=utf-8');
      const previewData = (await previewResponse.json()) as QuestPreview;
      expect(previewData.locales.en_us?.chapters[0]?.quests[0]?.title).toBe('Punch a Tree');
      const javascript = await fetch(new URL('/assets/app.js', preview.url));
      const stylesheet = await fetch(new URL('/assets/app.css', preview.url));
      const bootstrap = await fetch(new URL('/assets/theme.js', preview.url));
      expect(javascript.status).toBe(200);
      expect(javascript.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
      expect((await javascript.text()).length).toBeGreaterThan(10_000);
      expect(stylesheet.status).toBe(200);
      expect(stylesheet.headers.get('content-type')).toBe('text/css; charset=utf-8');
      const css = await stylesheet.text();
      expect(css).toContain('--mc-green: #55ff55');
      expect(css).toContain('[data-theme=light]');
      expect(bootstrap.status).toBe(200);
      expect(bootstrap.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
      const bootstrapSource = await bootstrap.text();
      expect(bootstrapSource).toContain('data-theme');
      expect(bootstrapSource.length).toBeLessThan(4_000);

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

/*
 * A theme is a token change, not a second stylesheet. Component rules may only
 * name semantic tokens, and every token has to exist in both themes, otherwise
 * one theme silently falls back to an unpainted value.
 */
describe('preview theme token architecture', () => {
  const tokens = authoredStylesheet('tokens.css');
  const components = authoredStylesheet('styles.css');

  const themeBlock = (selector: string): string => {
    const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'u').exec(tokens)?.[1];
    expect(block, `missing token block for ${selector}`).toBeDefined();
    return block ?? '';
  };

  const declaredNames = (block: string): string[] =>
    [...block.matchAll(/(--[\w-]+)\s*:/gu)].map(([, name]) => name).toSorted();

  const dark = themeBlock(":root\\[data-theme='dark'\\]");
  const light = themeBlock(":root\\[data-theme='light'\\]");

  it('defines the same semantic tokens in both themes', () => {
    expect(declaredNames(dark).length).toBeGreaterThan(50);
    expect(declaredNames(light)).toEqual(declaredNames(dark));
  });

  it('paints the dark theme for a document that was never claimed', () => {
    expect(tokens).toMatch(/:root,\s*:root\[data-theme='dark'\]\s*\{/u);
  });

  it('keeps color-scheme synchronized with each theme', () => {
    expect(dark).toMatch(/color-scheme:\s*dark;/u);
    expect(light).toMatch(/color-scheme:\s*light;/u);
  });

  it('gives the light theme its own values rather than reusing dark ones', () => {
    const values = (block: string): string[] =>
      [...block.matchAll(/--[\w-]+\s*:\s*([^;]+);/gu)].map(([, value]) => value.trim());

    const shared = values(light).filter((value) => values(dark).includes(value));
    expect(shared.length).toBeLessThan(values(dark).length / 4);
  });

  it('never names a theme colour in a component rule', () => {
    expect(components).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(components).not.toMatch(/\brgba?\(/u);
    expect(components).not.toMatch(/--mc-/u);
    // Sprite colours must be composed from tokens, never from literal channels.
    for (const [, channels] of components.matchAll(/\bhsla?\(([^)]*)\)/gu)) {
      expect(channels).not.toMatch(/\d/u);
    }
  });

  it('keeps the pixel drop shadow hard-edged in both themes', () => {
    const shadows = [...tokens.matchAll(/--pixel-shadow[\w-]*:\s*([^;]+);/gu)];
    expect(shadows).toHaveLength(4);
    for (const [, value] of shadows) {
      const lengths = value.replaceAll(/[a-z-]+\([^)]*\)/gu, ' ').match(/-?\d+(?:\.\d+)?(?:px)?/gu);
      expect(lengths?.slice(2)).toEqual(['0']);
    }
  });
});

/*
 * The preview must read as the in-game quest screen without decorative web
 * effects, so the authored stylesheets are held to flat fills, hard edges, and
 * no motion, in both themes. Vendor React Flow styles are out of scope; only
 * authored rules count.
 */
describe('preview stylesheet restraint', () => {
  const stylesheet = ['tokens.css', 'styles.css'].map(authoredStylesheet).join('\n');

  it('authors flat fills with no gradient of any kind', () => {
    expect(stylesheet).not.toMatch(/gradient\(/u);
  });

  it('authors no animation, blur, glow, or filter treatment', () => {
    expect(stylesheet).not.toMatch(/@keyframes/u);
    expect(stylesheet).not.toMatch(/\banimation\b/u);
    expect(stylesheet).not.toMatch(/\btransition\b/u);
    expect(stylesheet).not.toMatch(/\bfilter\s*:/u);
    expect(stylesheet).not.toMatch(/\bblur\(/u);
  });

  /*
   * A static dash pattern is connector geometry, not motion: the in-game
   * connector art is a repeated block. Only a dash offset could shift it, so
   * the offset property stays forbidden while the pattern itself is allowed.
   */
  it('allows a static dependency ribbon dash pattern but no dash offset', () => {
    expect(stylesheet).toMatch(/stroke-dasharray/u);
    expect(stylesheet).not.toMatch(/stroke-dashoffset/u);
  });

  it('keeps every authored shadow hard-edged with a zero blur radius', () => {
    const shadows = stylesheet.matchAll(/(?:box|text)-shadow:\s*([^;]+);/gu);
    for (const [, value] of shadows) {
      for (const layer of value.split(/,(?![^(]*\))/u)) {
        const lengths = layer
          .replaceAll(/[a-z-]+\([^)]*\)/gu, ' ')
          .replaceAll(/#[0-9a-f]{3,8}/giu, ' ')
          .match(/-?\d+(?:\.\d+)?(?:px)?/gu);
        expect((lengths ?? []).slice(2).every((length) => Number.parseFloat(length) === 0)).toBe(
          true,
        );
      }
    }
  });

  it('retains no resource monogram styling', () => {
    expect(stylesheet).not.toMatch(/resource-icon__stack/u);
  });
});
