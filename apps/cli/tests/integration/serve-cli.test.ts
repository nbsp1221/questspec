import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PreviewSnapshotV1 } from '@questspec/preview-contract';
import { describe, expect, it } from 'vitest';

const cliEntry = fileURLToPath(new URL('../../src/index.ts', import.meta.url));
const validSource = `questspec: 1
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
    quests: []
`;

const exactCatalog = JSON.stringify({
  advancements: {},
  items: ['minecraft:book'],
  target: {
    dataVersion: 13,
    loader: 'neoforge@21.1.248',
    minecraft: '1.21.1',
    questSystem: 'ftbquests@2101.1.33',
    serializer: 'ftblibrary@2101.1.35',
  },
});

interface RunningServe {
  readonly child: ChildProcessWithoutNullStreams;
  readonly url: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function startServe(sourcePath: string, extra: string[] = []): Promise<RunningServe> {
  const child = spawn(process.execPath, [cliEntry, 'serve', sourcePath, '--port', '0', ...extra], {
    env: { ...process.env, NO_COLOR: '1' },
    stdio: 'pipe',
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const url = await Promise.race([
    new Promise<string>((resolve, reject) => {
      const inspect = (): void => {
        const match = stdout.match(/Preview: (http:\/\/127\.0\.0\.1:\d+)/u);
        if (match !== null) {
          resolve(match[1]);
        }
      };

      child.stdout.on('data', inspect);
      child.once('exit', (code) => reject(new Error(`serve exited ${code}: ${stderr}`)));
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`serve URL timeout: ${stdout}\n${stderr}`)), 10_000);
    }),
  ]);
  return { child, url };
}

async function stopServe(running: RunningServe, signal: 'SIGINT' | 'SIGTERM'): Promise<number> {
  const exited = new Promise<number>((resolve) => {
    running.child.once('exit', (code) => resolve(code ?? -1));
  });
  running.child.kill(signal);
  return exited;
}

async function snapshot(url: string): Promise<PreviewSnapshotV1> {
  const response = await fetch(`${url}/api/preview`);
  expect(response.status).toBe(200);
  return response.json() as Promise<PreviewSnapshotV1>;
}

async function waitForGeneration(url: string, generation: number): Promise<PreviewSnapshotV1> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const current = await snapshot(url);
    if (current.generation >= generation) {
      return current;
    }
    await delay(25);
  }
  throw new Error(`Timed out waiting for preview generation ${generation}`);
}

describe('questspec serve CLI', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    'binds literal loopback on port 0 and shuts down cleanly for %s',
    async (signal) => {
      const root = await mkdtemp(join(tmpdir(), 'questspec-serve-cli-'));
      const sourcePath = join(root, 'quests.yml');
      await writeFile(sourcePath, validSource);
      const running = await startServe(sourcePath);

      expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
      expect((await fetch(`${running.url}/health`)).status).toBe(200);
      expect(await snapshot(running.url)).toMatchObject({
        currentInput: { sourceState: 'normalized', validationState: 'valid' },
        generation: 1,
      });
      await expect(stopServe(running, signal)).resolves.toBe(0);
    },
    15_000,
  );

  it('starts with invalid content, retains/replaces state, and recovers through the watcher', async () => {
    const root = await mkdtemp(join(tmpdir(), 'questspec-serve-cli-'));
    const sourcePath = join(root, 'quests.yml');
    await writeFile(sourcePath, 'questspec: [');
    const running = await startServe(sourcePath);
    expect(await snapshot(running.url)).toMatchObject({
      currentInput: { sourceState: 'not-normalizable', validationState: 'invalid' },
      generation: 1,
      model: null,
    });

    await writeFile(sourcePath, validSource);
    const recovered = await waitForGeneration(running.url, 2);
    expect(recovered).toMatchObject({
      currentInput: { sourceState: 'normalized', validationState: 'valid' },
      retainedModel: { state: 'current' },
    });
    await expect(stopServe(running, 'SIGTERM')).resolves.toBe(0);
  }, 15_000);

  it('serves malformed catalog state and recovers after deletion and recreation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'questspec-serve-cli-'));
    const sourcePath = join(root, 'quests.yml');
    const catalogPath = join(root, 'resources.json');
    await writeFile(sourcePath, validSource);
    await writeFile(catalogPath, '{');
    const running = await startServe(sourcePath, ['--resources', catalogPath]);
    expect(await snapshot(running.url)).toMatchObject({
      currentInput: { catalogState: 'unavailable', validationState: 'unavailable' },
      generation: 1,
    });

    await writeFile(catalogPath, exactCatalog);
    expect(await waitForGeneration(running.url, 2)).toMatchObject({
      currentInput: { catalogState: 'current', validationState: 'valid' },
    });

    await rm(catalogPath);
    expect(await waitForGeneration(running.url, 3)).toMatchObject({
      currentInput: { catalogState: 'unavailable', validationState: 'unavailable' },
    });
    await writeFile(catalogPath, exactCatalog);
    expect(await waitForGeneration(running.url, 4)).toMatchObject({
      currentInput: { catalogState: 'current', validationState: 'valid' },
    });
    await expect(stopServe(running, 'SIGTERM')).resolves.toBe(0);
  }, 20_000);

  it('rejects invalid ports and startup file-status failures before binding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'questspec-serve-cli-'));
    const directory = join(root, 'directory');
    await mkdir(directory);
    const invalidPort = spawnSync(
      process.execPath,
      [cliEntry, 'serve', directory, '--port', '65536'],
      {
        encoding: 'utf8',
      },
    );
    expect(invalidPort.status).toBe(1);
    expect(invalidPort.stderr).toContain('--port must be');

    const invalidInput = spawnSync(
      process.execPath,
      [cliEntry, 'serve', directory, '--port', '0'],
      {
        encoding: 'utf8',
      },
    );
    expect(invalidInput.status).toBe(1);
    expect(invalidInput.stderr).toContain('source must be a regular file');
    expect(invalidInput.stdout).not.toContain('Preview:');
  });

  it('exposes no host option', () => {
    const result = spawnSync(process.execPath, [cliEntry, 'serve', '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--port <integer>');
    expect(result.stdout).toContain('--resources <catalog>');
    expect(result.stdout).toContain('--open');
    expect(result.stdout).not.toContain('--host');
  });
});
