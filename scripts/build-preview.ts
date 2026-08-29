import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const outputDirectory = resolve('dist/preview');

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });
await build({
  bundle: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  entryNames: '[name]',
  entryPoints: {
    app: 'src/preview/client/main.tsx',
    theme: 'src/preview/client/theme-bootstrap.ts',
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
