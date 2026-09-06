import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import tailwindPackage from '@tailwindcss/cli/package.json' with { type: 'json' };
import { build } from 'esbuild';

const execute = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(repositoryRoot, 'apps/preview/dist');

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });
await build({
  absWorkingDir: repositoryRoot,
  bundle: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  entryNames: '[name]',
  entryPoints: {
    app: 'apps/preview/src/main.tsx',
    theme: 'apps/preview/src/theme-bootstrap.ts',
  },
  format: 'iife',
  legalComments: 'eof',
  logLevel: 'info',
  minify: true,
  outdir: outputDirectory,
  platform: 'browser',
  sourcemap: false,
  target: ['chrome120', 'firefox121', 'safari17'],
});

const tailwindPackageDirectory = dirname(
  fileURLToPath(import.meta.resolve('@tailwindcss/cli/package.json')),
);
const tailwindExecutable = resolve(tailwindPackageDirectory, tailwindPackage.bin.tailwindcss);
await execute(
  process.execPath,
  [
    tailwindExecutable,
    '--input',
    resolve(repositoryRoot, 'apps/preview/src/styles.css'),
    '--output',
    resolve(outputDirectory, 'app.css'),
    '--minify',
  ],
  { cwd: repositoryRoot },
);
