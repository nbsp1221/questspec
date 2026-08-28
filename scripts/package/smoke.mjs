import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { manifestFiles, readJson, stage } from './lib.mjs';

const source = `questspec: 1\ntarget:\n  minecraft: 1.21.1\n  loader: neoforge@21.1.248\n  questSystem: ftbquests@2101.1.33\n  serializer: ftblibrary@2101.1.35\n  dataVersion: 13\nlocales:\n  default: en_us\n  supported: [en_us]\ngroups:\n  - key: group\nchapters:\n  - key: chapter\n    group: group\n    filename: chapter\n    title: {en_us: Chapter}\n    icon: minecraft:book\n    quests: []\n`;
const root = await mkdtemp(join(tmpdir(), 'questspec-external-smoke-'));
const pack = join(root, 'pack');
const consumer = join(root, 'consumer');
await import('node:fs/promises').then(({ mkdir }) => Promise.all([mkdir(pack), mkdir(consumer)]));
try {
  const report = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', pack], {
      cwd: stage,
      encoding: 'utf8',
    }),
  )[0];
  const tarball = join(pack, report.filename);
  await writeFile(join(consumer, 'package.json'), '{"name":"external-consumer","private":true}\n');
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], {
    cwd: consumer,
    stdio: 'inherit',
  });
  const installed = resolve(consumer, 'node_modules/questspec');
  const manifest = await readJson(resolve(installed, 'package.json'));
  const viteManifest = await readJson(resolve(installed, 'dist/preview/.vite/manifest.json'));
  const binDirectory = resolve(consumer, 'node_modules/.bin');
  const command =
    process.platform === 'win32'
      ? resolve(binDirectory, 'questspec.cmd')
      : resolve(binDirectory, 'questspec');
  const run = (args) => execFileSync(command, args, { cwd: consumer, encoding: 'utf8' });
  if (!run(['--help']).includes('Serve a local read-only browser preview'))
    throw new Error('Installed --help failed');
  if (!run(['--version']).startsWith(`questspec/${manifest.version} `)) {
    throw new Error('Installed --version failed');
  }
  const sourcePath = join(consumer, 'quests.yml');
  await writeFile(sourcePath, source);
  const guard = join(consumer, 'block-outbound.cjs');
  await writeFile(
    guard,
    `const net=require('node:net');const deny=()=>{throw new Error('outbound network forbidden')};net.connect=deny;net.createConnection=deny;\n`,
  );

  for (const signal of ['SIGTERM', 'SIGINT']) {
    const child = spawn(command, ['serve', sourcePath, '--port', '0'], {
      cwd: consumer,
      env: {
        ...process.env,
        PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ''}`,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${guard}`.trim(),
        npm_config_offline: 'true',
      },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const url = await Promise.race([
      new Promise((accept, reject) => {
        const inspect = () => {
          const match = stdout.match(/Preview: (http:\/\/127\.0\.0\.1:\d+)/u);
          if (match) accept(match[1]);
        };
        child.stdout.on('data', inspect);
        child.once('exit', (code) =>
          reject(new Error(`Installed serve exited ${code}: ${stdout}\n${stderr}`)),
        );
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Installed serve timed out: ${stdout}\n${stderr}`)),
          15_000,
        ),
      ),
    ]);
    const paths = ['/', '/api/preview', ...manifestFiles(viteManifest).map((file) => `/${file}`)];
    for (const path of paths) {
      const response = await fetch(`${url}${path}`);
      if (response.status !== 200)
        throw new Error(`Installed serve returned ${response.status} for ${path}`);
      await response.arrayBuffer();
    }
    for (const path of [
      ...manifestFiles(viteManifest)
        .filter((file) => /\.(?:css|js)$/u.test(file))
        .map((file) => `/${file}.map`),
      '/assets/orphan.js',
    ]) {
      const response = await fetch(`${url}${path}`);
      if (response.status !== 404)
        throw new Error(`Installed serve exposed guessed/orphan asset ${path}: ${response.status}`);
    }
    const exited = new Promise((accept, reject) => {
      child.once('exit', (code) =>
        code === 0
          ? accept()
          : reject(new Error(`Installed serve signal ${signal} exited ${code}: ${stderr}`)),
      );
    });
    child.kill(signal);
    await Promise.race([
      exited,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Installed serve leaked after ${signal}`)), 10_000),
      ),
    ]);
  }
  const browserFetchSurfaces = (
    await Promise.all(
      ['index.html', ...manifestFiles(viteManifest).filter((file) => /\.css$/u.test(file))].map(
        (file) => readFile(resolve(installed, 'dist/preview', ...file.split('/')), 'utf8'),
      ),
    )
  ).join('\n');
  if (
    /(?:src|href)=["']https?:/iu.test(browserFetchSurfaces) ||
    /@import\s+(?:url\()?['"]?https?:/iu.test(browserFetchSurfaces) ||
    /url\(['"]?https?:/iu.test(browserFetchSurfaces)
  )
    throw new Error('Browser payload contains an unexpected remote asset fetch');
  console.log(
    `External installed smoke passed: ${report.filename}; ${manifestFiles(viteManifest).length} manifest assets; SIGTERM/SIGINT clean`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
