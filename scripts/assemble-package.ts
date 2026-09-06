import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const packageOutput = resolve('dist');

await mkdir(resolve(packageOutput, 'preview'), { recursive: true });
await Promise.all([
  cp(resolve('apps/cli/dist/index.mjs'), resolve(packageOutput, 'index.mjs')),
  cp(resolve('apps/cli/dist/index.mjs.map'), resolve(packageOutput, 'index.mjs.map')),
  cp(resolve('apps/preview/dist/app.css'), resolve(packageOutput, 'preview/app.css')),
  cp(resolve('apps/preview/dist/app.js'), resolve(packageOutput, 'preview/app.js')),
  cp(resolve('apps/preview/dist/theme.js'), resolve(packageOutput, 'preview/theme.js')),
]);
