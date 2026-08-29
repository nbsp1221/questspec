import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);

async function questFixture(root: string): Promise<string> {
  const questDirectory = join(root, 'quest-input');
  await mkdir(join(questDirectory, 'chapters'), { recursive: true });
  await mkdir(join(questDirectory, 'lang'));
  await writeFile(join(questDirectory, 'data.snbt'), '{ version: 13 }');
  await writeFile(join(questDirectory, 'chapter_groups.snbt'), '{ chapter_groups: [{ id: "G" }] }');
  await writeFile(
    join(questDirectory, 'chapters', 'start.snbt'),
    '{ id: "C", group: "G", quests: [{ id: "Q", x: 1.0d, y: 2.0d, tasks: [{ type: "item", item: "minecraft:book" }] }] }',
  );
  await writeFile(
    join(questDirectory, 'lang', 'en_us.snbt'),
    '{ chapter_group.G.title: "Group", chapter.C.title: "Chapter", quest.Q.title: "Packaged Quest" }',
  );
  return questDirectory;
}

async function waitForUrl(child: ReturnType<typeof spawn>): Promise<string> {
  return new Promise((accept, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Packaged preview did not report a URL')),
      15_000,
    );

    const inspect = (chunk: Buffer): void => {
      const match = /Quest preview: (http:\/\/127\.0\.0\.1:\d+\/)/u.exec(chunk.toString());
      if (match?.[1] !== undefined) {
        clearTimeout(timeout);
        accept(match[1]);
      }
    };

    child.stdout?.on('data', inspect);
    child.stderr?.on('data', inspect);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

describe('packaged browser preview', () => {
  it('ships and resolves deterministic browser assets from an installed package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'questspec-preview-package-'));
    const packDirectory = join(root, 'pack');
    const installDirectory = join(root, 'install');
    await mkdir(packDirectory);
    await mkdir(installDirectory);
    await execute('pnpm', ['pack', '--pack-destination', packDirectory], {
      cwd: process.cwd(),
      timeout: 60_000,
    });
    const archive = join(
      packDirectory,
      (await readdir(packDirectory)).find((entry) => entry.endsWith('.tgz')) ?? '',
    );
    const { stdout: contents } = await execute('tar', ['-tzf', archive]);
    expect(contents).toContain('package/dist/index.mjs');
    expect(contents).toContain('package/dist/preview/app.js');
    expect(contents).toContain('package/dist/preview/app.css');
    expect(contents).not.toContain('package/src/');

    await writeFile(join(installDirectory, 'package.json'), '{"private":true}');
    await execute('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', archive], {
      cwd: installDirectory,
      timeout: 120_000,
    });
    const input = await questFixture(root);
    const executable = join(installDirectory, 'node_modules', 'questspec', 'dist', 'index.mjs');
    const child = spawn(process.execPath, [executable, 'serve', input], {
      cwd: input,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const url = await waitForUrl(child);
      const [page, javascript, stylesheet, preview] = await Promise.all([
        fetch(url),
        fetch(new URL('/assets/app.js', url)),
        fetch(new URL('/assets/app.css', url)),
        fetch(new URL('/preview.json', url)),
      ]);
      expect(page.status).toBe(200);
      expect(javascript.status).toBe(200);
      expect(stylesheet.status).toBe(200);
      expect(await stylesheet.text()).toContain('--graphite-950');
      expect(await preview.text()).toContain('Packaged Quest');
    } finally {
      child.kill('SIGTERM');
      await Promise.race([
        once(child, 'exit'),
        new Promise<void>((accept) => {
          setTimeout(() => accept(), 5_000);
        }),
      ]);
    }
  }, 180_000);
});
