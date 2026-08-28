import { isAbsolute, relative, resolve, sep } from 'node:path';

export const WORKSPACE_ROOTS = Object.freeze({
  'apps/cli': 'questspec',
  'apps/preview': '@questspec/preview',
  'packages/core': '@questspec/core',
  'packages/preview-contract': '@questspec/preview-contract',
});

export const INTERNAL_ADJACENCY = Object.freeze({
  'questspec': new Set(['@questspec/core', '@questspec/preview-contract']),
  '@questspec/preview': new Set(['@questspec/preview-contract']),
  '@questspec/core': new Set(),
  '@questspec/preview-contract': new Set(),
});

export function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

export function sourceOwner(file, repositoryRoot) {
  const normalized = relative(repositoryRoot, file).split(sep).join('/');
  for (const [root, name] of Object.entries(WORKSPACE_ROOTS)) {
    if (normalized === root || normalized.startsWith(`${root}/`)) return { name, root };
  }
  return null;
}

export function validateImport({ declaredPackages, file, repositoryRoot, specifier }) {
  const owner = sourceOwner(file, repositoryRoot);
  if (!owner) return null;

  if (specifier.startsWith('.')) {
    const target = resolve(file, '..', specifier);
    const targetOwner = sourceOwner(target, repositoryRoot);
    if (!targetOwner || targetOwner.name !== owner.name) {
      return `cross-root relative import from ${owner.name} to ${specifier}`;
    }
    return null;
  }

  if (isAbsolute(specifier)) return `absolute import is forbidden: ${specifier}`;
  if (specifier.startsWith('node:')) return null;

  const importedPackage = packageNameFromSpecifier(specifier);
  if (importedPackage === 'questspec' || importedPackage.startsWith('@questspec/')) {
    if (!INTERNAL_ADJACENCY[owner.name].has(importedPackage)) {
      return `forbidden internal edge ${owner.name} -> ${importedPackage}`;
    }
    if (!declaredPackages.has(importedPackage)) {
      return `undeclared internal import ${importedPackage} from ${owner.name}`;
    }
    return null;
  }

  if (!declaredPackages.has(importedPackage)) {
    return `undeclared package import ${importedPackage} from ${owner.name}`;
  }
  return null;
}
