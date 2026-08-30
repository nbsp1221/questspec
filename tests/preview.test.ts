import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postcss, { type Declaration, type Root } from 'postcss';
import { describe, expect, it } from 'vitest';
import { startPreviewServer } from '../apps/cli/src/preview/server.ts';
import { readSnbtDirectory } from '../packages/core/src/filesystem/read-directory.ts';
import { type QuestPreview, buildQuestPreview } from '../packages/core/src/preview/model.ts';

function authoredStylesheet(file: string): string {
  return readFileSync(new URL(`../apps/preview/src/${file}`, import.meta.url), 'utf8');
}

const componentStylesheets = ['shell.css', 'graph.css', 'inspector.css'];

function authoredComponentStyles(): string {
  return componentStylesheets.map(authoredStylesheet).join('\n');
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
    expect(preview.availableLocales).toEqual(['en_us']);
    expect(preview.locale.groups[0].title).toBe('Getting Started');
    expect(preview.chapter).toMatchObject({
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

  it('merges Lang Splitter fragments by their locale directory', async () => {
    const root = await fixture();
    await mkdir(join(root, 'lang', 'ko_kr', 'chapters'), { recursive: true });
    await writeFile(
      join(root, 'lang', 'ko_kr', 'chapter_group.snbt'),
      '{ chapter_group.A.title: "시작하기" }',
    );
    await writeFile(
      join(root, 'lang', 'ko_kr', 'chapters', 'start.snbt'),
      '{ chapter.B.title: "첫걸음", quest.Q1.title: "나무 캐기" }',
    );

    const preview = buildQuestPreview(root, await readSnbtDirectory(root), 'ko_kr');

    expect(preview.availableLocales).toEqual(['en_us', 'ko_kr']);
    expect(preview.selectedLocale).toBe('ko_kr');
    expect(preview.locale.groups[0]?.title).toBe('시작하기');
    expect(preview.chapter).toMatchObject({
      title: '첫걸음',
      quests: [{ title: '나무 캐기' }, { title: 'Level Up' }],
    });
  });

  it('accepts dependencies on task objects supported by FTB Quests', async () => {
    const root = await fixture();
    const chapterPath = join(root, 'chapters', 'start.snbt');
    const chapter = await readFile(chapterPath, 'utf8');
    await writeFile(chapterPath, chapter.replace('dependencies: ["Q1"]', 'dependencies: ["T1"]'));

    const preview = buildQuestPreview(root, await readSnbtDirectory(root));

    expect(preview.chapter?.quests[1]?.dependencies).toEqual(['T1']);
    expect(preview.diagnostics).toEqual([]);
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
      expect(previewData.chapter?.quests[0]?.title).toBe('Punch a Tree');
      expect(previewData.locale.chapters[0]).not.toHaveProperty('quests');
      expect(previewData.locale.chapters[0]).toHaveProperty('questCount', 2);
      const javascript = await fetch(new URL('/assets/app.js', preview.url));
      const stylesheet = await fetch(new URL('/assets/app.css', preview.url));
      const bootstrap = await fetch(new URL('/assets/theme.js', preview.url));
      expect(javascript.status).toBe(200);
      expect(javascript.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
      expect((await javascript.text()).length).toBeGreaterThan(10_000);
      expect(stylesheet.status).toBe(200);
      expect(stylesheet.headers.get('content-type')).toBe('text/css; charset=utf-8');
      const css = await stylesheet.text();
      expect(css).toMatch(/--mc-green:(?:#55ff55|#5f5)/u);
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
  const tokens = postcss.parse(authoredStylesheet('tokens.css'));
  const components = postcss.parse(authoredComponentStyles());
  const dark = declarationsForSelector(tokens, ":root[data-theme='dark']");
  const light = declarationsForSelector(tokens, ":root[data-theme='light']");

  it('defines the same semantic tokens in both themes', () => {
    expect([...light.keys()].toSorted()).toEqual([...dark.keys()].toSorted());
  });

  it('paints the dark theme for a document that was never claimed', () => {
    const defaultTheme = declarationsForSelector(tokens, ':root');
    expect(defaultTheme.get('--surface-world')).toBe(dark.get('--surface-world'));
  });

  it('keeps color-scheme synchronized with each theme', () => {
    expect(dark.get('color-scheme')).toBe('dark');
    expect(light.get('color-scheme')).toBe('light');
  });

  it('never names a theme colour in a component rule', () => {
    for (const declaration of declarations(components)) {
      expect(declaration.value).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
      expect(declaration.value).not.toMatch(/\brgba?\(/u);
      expect(declaration.value).not.toMatch(/--mc-/u);
      for (const [, channels] of declaration.value.matchAll(/\bhsla?\(([^)]*)\)/gu)) {
        expect(channels).not.toMatch(/\d/u);
      }
    }
  });

  it('keeps the pixel drop shadow hard-edged in both themes', () => {
    const shadows = declarations(tokens).filter(({ prop }) => prop.startsWith('--pixel-shadow'));
    expect(shadows).toHaveLength(4);
    for (const { value } of shadows) {
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
  const stylesheet = postcss.parse(
    ['tokens.css', ...componentStylesheets].map(authoredStylesheet).join('\n'),
  );

  it('authors flat fills with no gradient of any kind', () => {
    for (const declaration of declarations(stylesheet)) {
      expect(declaration.value).not.toMatch(/gradient\(/u);
    }
  });

  it('authors no animation, blur, glow, or filter treatment', () => {
    expect(
      stylesheet.nodes.some((node) => node.type === 'atrule' && node.name === 'keyframes'),
    ).toBe(false);
    for (const declaration of declarations(stylesheet)) {
      expect(['animation', 'animation-name', 'filter', 'transition']).not.toContain(
        declaration.prop,
      );
      expect(declaration.value).not.toMatch(/\bblur\(/u);
    }
  });

  /*
   * A static dash pattern is connector geometry, not motion: the in-game
   * connector art is a repeated block. Only a dash offset could shift it, so
   * the offset property stays forbidden while the pattern itself is allowed.
   */
  it('allows a static dependency ribbon dash pattern but no dash offset', () => {
    const properties = declarations(stylesheet).map(({ prop }) => prop);
    expect(properties).toContain('stroke-dasharray');
    expect(properties).not.toContain('stroke-dashoffset');
  });

  it('keeps every authored shadow hard-edged with a zero blur radius', () => {
    const shadows = declarations(stylesheet).filter(({ prop }) =>
      /^(?:box|text)-shadow$/u.test(prop),
    );
    for (const { value } of shadows) {
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
    const selectors: string[] = [];
    stylesheet.walkRules((rule) => {
      selectors.push(rule.selector);
    });
    expect(selectors.some((selector) => selector.includes('resource-icon__stack'))).toBe(false);
  });
});

function declarations(root: Root): Declaration[] {
  const result: Declaration[] = [];
  root.walkDecls((declaration) => {
    result.push(declaration);
  });
  return result;
}

function declarationsForSelector(root: Root, selector: string): Map<string, string> {
  const result = new Map<string, string>();
  root.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) {
      return;
    }
    rule.walkDecls((declaration) => {
      result.set(declaration.prop, declaration.value);
    });
  });
  expect(result.size, `missing token block for ${selector}`).toBeGreaterThan(0);
  return result;
}
