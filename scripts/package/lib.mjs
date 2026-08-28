import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const stage = resolve(root, 'dist/package');
export const INTERNAL_SPECIFIERS = ['@questspec/core', '@questspec/preview-contract'];
export const FIXED_STAGE_FILES = [
  'LICENSE',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  'dist/index.mjs',
  'dist/preview/.vite/manifest.json',
  'dist/preview/index.html',
  'package.json',
  'schema/questspec-1.json',
];

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

export function assertSafeRelativePath(path, label = 'path') {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('?') ||
    path.includes('#') ||
    path.includes('\0') ||
    path.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new Error(`${label} is not a safe canonical relative path: ${String(path)}`);
  }
}

export async function listRegularFiles(directory) {
  const files = [];
  async function visit(current, prefix) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const childRelative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      assertSafeRelativePath(childRelative);
      const child = resolve(current, entry.name);
      const status = await lstat(child);
      if (status.isSymbolicLink())
        throw new Error(`Symlinks are forbidden in package inputs: ${childRelative}`);
      if (status.isDirectory()) await visit(child, childRelative);
      else if (status.isFile()) files.push(childRelative);
      else throw new Error(`Non-regular package input is forbidden: ${childRelative}`);
    }
  }
  await visit(directory, '');
  return files.sort();
}

export function manifestFiles(manifest) {
  const entry = manifest['index.html'];
  if (entry?.isEntry !== true) throw new Error('Vite manifest must contain the index.html entry');
  const files = new Set();
  const visiting = new Set();
  const visited = new Set();
  function add(file) {
    assertSafeRelativePath(file, 'Vite manifest file');
    if (file.endsWith('.map'))
      throw new Error(`Vite manifest must not select a source map: ${file}`);
    files.add(file);
  }
  function visit(key) {
    assertSafeRelativePath(key, 'Vite manifest key');
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error(`Vite manifest import cycle at ${key}`);
    const declaration = manifest[key];
    if (declaration === undefined || declaration === null || typeof declaration !== 'object') {
      throw new Error(`Vite manifest references missing entry: ${key}`);
    }
    visiting.add(key);
    add(declaration.file);
    for (const field of ['assets', 'css']) {
      const values = declaration[field] ?? [];
      if (!Array.isArray(values)) throw new Error(`Vite manifest ${key}.${field} must be an array`);
      for (const file of values) add(file);
    }
    for (const field of ['dynamicImports', 'imports']) {
      const values = declaration[field] ?? [];
      if (!Array.isArray(values)) throw new Error(`Vite manifest ${key}.${field} must be an array`);
      for (const child of values) visit(child);
    }
    visiting.delete(key);
    visited.add(key);
  }
  visit('index.html');
  return [...files].sort();
}

export function assertExactVersion(version, label) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(`${label} must be a concrete exact registry version, received ${version}`);
  }
}

export function bareLockVersion(version) {
  return String(version).replace(/\(.+\)$/u, '');
}

export async function copyFileChecked(source, destination) {
  const status = await lstat(source);
  if (!status.isFile() || status.isSymbolicLink())
    throw new Error(`Package input must be a regular non-symlink: ${source}`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, await readFile(source), { mode: status.mode & 0o777 });
}

export async function scanForInternalSpecifiers(directory) {
  for (const file of await listRegularFiles(directory)) {
    if (!/\.(?:css|html|js|json|mjs)$/u.test(file)) continue;
    const bytes = await readFile(resolve(directory, ...file.split('/')), 'utf8');
    for (const specifier of INTERNAL_SPECIFIERS) {
      if (bytes.includes(specifier))
        throw new Error(`Release byte ${file} contains internal specifier ${specifier}`);
    }
  }
}

export async function hashFiles(directory, files) {
  const result = {};
  for (const file of files) {
    result[file] = createHash('sha256')
      .update(await readFile(resolve(directory, ...file.split('/'))))
      .digest('hex');
  }
  return result;
}

export function temporarySibling(prefix = '.package-tmp-') {
  return resolve(root, `dist/${prefix}${process.pid}-${randomUUID()}`);
}

export async function cleanEphemeralSiblings() {
  await mkdir(resolve(root, 'dist'), { recursive: true });
  for (const entry of await readdir(resolve(root, 'dist'))) {
    if (entry.startsWith('.package-tmp-'))
      await rm(resolve(root, 'dist', entry), { recursive: true, force: true });
  }
}

export function stagePath(file) {
  assertSafeRelativePath(file);
  const destination = resolve(stage, ...file.split('/'));
  const rel = relative(stage, destination);
  if (rel.startsWith('..') || rel.split(sep).includes('..'))
    throw new Error(`Path escaped stage: ${file}`);
  return destination;
}

export function tarballAllowlist(manifest) {
  return [
    ...FIXED_STAGE_FILES,
    ...manifestFiles(manifest).map((file) => posix.join('dist/preview', file)),
  ].sort();
}
