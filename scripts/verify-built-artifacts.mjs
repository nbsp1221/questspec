import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputRoots = [resolve(root, 'apps/cli/dist'), resolve(root, 'apps/preview/dist')];
const forbidden = ['@questspec/core', '@questspec/preview-contract'];
const failures = [];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}

for (const outputRoot of outputRoots) {
  let outputFiles;
  try {
    outputFiles = await files(outputRoot);
  } catch {
    failures.push(`missing build output: ${outputRoot.slice(root.length + 1)}`);
    continue;
  }
  for (const file of outputFiles) {
    if (!/\.(?:css|html|js|json|mjs)$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    for (const specifier of forbidden) {
      if (source.includes(specifier))
        failures.push(`${file.slice(root.length + 1)} contains ${specifier}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Built artifacts contain no internal workspace specifiers.');
}
