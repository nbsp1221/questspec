import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashFiles, listRegularFiles, manifestFiles, readJson, root, stage } from './lib.mjs';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
async function cleanBuild() {
  await Promise.all([
    rm(resolve(root, 'apps/cli/dist'), { recursive: true, force: true }),
    rm(resolve(root, 'apps/preview/dist'), { recursive: true, force: true }),
    rm(resolve(root, 'dist'), { recursive: true, force: true }),
  ]);
  execFileSync(pnpm, ['--filter', 'questspec', 'build'], { cwd: root, stdio: 'inherit' });
  execFileSync(pnpm, ['--filter', '@questspec/preview', 'build'], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, [resolve(root, 'scripts/package/assemble.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  const manifest = await readJson(resolve(stage, 'dist/preview/.vite/manifest.json'));
  manifestFiles(manifest);
  const files = await listRegularFiles(stage);
  return { files, hashes: await hashFiles(stage, files) };
}

const first = await cleanBuild();
const second = await cleanBuild();
if (JSON.stringify(first) !== JSON.stringify(second))
  throw new Error(
    `Two clean package builds were not reproducible\nfirst=${JSON.stringify(first, null, 2)}\nsecond=${JSON.stringify(second, null, 2)}`,
  );
console.log(
  `Two-clean-build reproducibility passed for ${Object.keys(second.hashes).length} package/browser files`,
);
