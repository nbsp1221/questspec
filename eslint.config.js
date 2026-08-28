import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import retn0 from '@retn0/eslint-config';
import eslintConfigOxlint from '@retn0/eslint-config-oxlint';
import { globalIgnores } from 'eslint/config';
import { WORKSPACE_ROOTS, sourceOwner, validateImport } from './scripts/boundary-policy.mjs';

const repositoryRoot = import.meta.dirname;
const dependencySections = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const declarations = new Map();
for (const workspacePath of Object.keys(WORKSPACE_ROOTS)) {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, workspacePath, 'package.json'), 'utf8'),
  );
  const packages = new Set();
  for (const section of dependencySections) {
    for (const name of Object.keys(manifest[section] ?? {})) packages.add(name);
  }
  declarations.set(manifest.name, packages);
}

const workspaceBoundaries = {
  rules: {
    imports: {
      meta: {
        schema: [],
        type: 'problem',
      },
      create(context) {
        const file = context.filename;
        const owner = sourceOwner(file, repositoryRoot);
        if (!owner) return {};
        const check = (node) => {
          if (typeof node.source?.value !== 'string') return;
          const message = validateImport({
            declaredPackages: declarations.get(owner.name),
            file,
            repositoryRoot,
            specifier: node.source.value,
          });
          if (message) context.report({ message, node: node.source });
        };
        return {
          ExportAllDeclaration: check,
          ExportNamedDeclaration: check,
          ImportDeclaration: check,
          ImportExpression: check,
        };
      },
    },
  },
};

export default retn0(
  {
    environments: ['node'],
    perfectionist: true,
  },
  eslintConfigOxlint,
  {
    files: ['apps/**/*.{js,jsx,mjs,cjs,ts,tsx}', 'packages/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    plugins: { 'questspec-boundaries': workspaceBoundaries },
    rules: { 'questspec-boundaries/imports': 'error' },
  },
  globalIgnores(['**/coverage/**', '**/dist/**', '**/playwright-report/**', '**/test-results/**']),
);
