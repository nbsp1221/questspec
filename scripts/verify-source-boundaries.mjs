import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { WORKSPACE_ROOTS, validateImport } from './boundary-policy.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const failures = [];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      ['coverage', 'dist', 'node_modules', 'playwright-report', 'test-results'].includes(entry.name)
    )
      continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) files.push(path);
  }
  return files;
}

for (const [workspacePath] of Object.entries(WORKSPACE_ROOTS)) {
  const workspaceRoot = resolve(repositoryRoot, workspacePath);
  const manifest = JSON.parse(await readFile(resolve(workspaceRoot, 'package.json'), 'utf8'));
  const declaredPackages = new Set();
  for (const section of dependencySections) {
    for (const name of Object.keys(manifest[section] ?? {})) declaredPackages.add(name);
  }

  for (const file of await sourceFiles(workspaceRoot)) {
    const source = await readFile(file, 'utf8');
    const imports = ts.preProcessFile(source, true, true).importedFiles;
    for (const imported of imports) {
      const failure = validateImport({
        declaredPackages,
        file,
        repositoryRoot,
        specifier: imported.fileName,
      });
      if (failure) failures.push(`${file.slice(repositoryRoot.length + 1)}: ${failure}`);
    }
  }
}

if (process.argv.includes('--self-test')) {
  const fixture = (ownerPath, specifier, declared = []) =>
    validateImport({
      declaredPackages: new Set(declared),
      file: resolve(repositoryRoot, ownerPath, 'src/fixture.ts'),
      repositoryRoot,
      specifier,
    });
  const negativeFixtures = [
    fixture('apps/cli', '@questspec/preview', ['@questspec/preview']),
    fixture('apps/preview', '@questspec/core', ['@questspec/core']),
    fixture('apps/preview', 'questspec', ['questspec']),
    fixture('packages/core', 'questspec', ['questspec']),
    fixture('packages/preview-contract', '@questspec/preview', ['@questspec/preview']),
    fixture('apps/cli', '../../preview/src/main.tsx'),
    fixture('apps/preview', '../../../packages/preview-contract/src/index.ts'),
    fixture('packages/core', 'not-declared'),
  ];
  if (negativeFixtures.some((result) => result === null))
    failures.push('boundary negative self-test failed');
  if (fixture('apps/cli', '@questspec/core', ['@questspec/core']) !== null) {
    failures.push('boundary positive self-test failed');
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Workspace source boundaries are valid.');
}
