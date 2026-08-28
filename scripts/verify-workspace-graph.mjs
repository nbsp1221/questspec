import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { INTERNAL_ADJACENCY, WORKSPACE_ROOTS } from './boundary-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const failures = [];

for (const [workspacePath, expectedName] of Object.entries(WORKSPACE_ROOTS)) {
  const manifest = JSON.parse(await readFile(resolve(root, workspacePath, 'package.json'), 'utf8'));
  if (manifest.name !== expectedName)
    failures.push(`${workspacePath}: expected name ${expectedName}`);

  const actualInternal = new Set();
  for (const section of dependencySections) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (name === 'turbo') failures.push(`${workspacePath}: turbo must be root-only`);
      if (!name.startsWith('@questspec/')) continue;
      actualInternal.add(name);
      if (section !== 'dependencies')
        failures.push(`${workspacePath}: ${name} must be in dependencies`);
      if (version !== 'workspace:*')
        failures.push(`${workspacePath}: ${name} must use workspace:*`);
    }
  }

  const expectedInternal = INTERNAL_ADJACENCY[expectedName];
  for (const name of expectedInternal) {
    if (!actualInternal.has(name))
      failures.push(`${workspacePath}: missing internal edge to ${name}`);
  }
  for (const name of actualInternal) {
    if (!expectedInternal.has(name))
      failures.push(`${workspacePath}: forbidden internal edge to ${name}`);
  }
}

const rootManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (rootManifest.private !== true) failures.push('root package must be private');
if (rootManifest.dependencies) failures.push('root package must not have runtime dependencies');
if (rootManifest.devDependencies?.turbo !== 'catalog:')
  failures.push('root turbo must use catalog:');

const workspaceYaml = await readFile(resolve(root, 'pnpm-workspace.yaml'), 'utf8');
if (!/^  turbo: 2\.10\.12$/m.test(workspaceYaml))
  failures.push('catalog must pin turbo exactly to 2.10.12');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Workspace manifest graph is valid.');
}
