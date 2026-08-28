import { chmod, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  INTERNAL_SPECIFIERS,
  assertExactVersion,
  bareLockVersion,
  canonicalJson,
  cleanEphemeralSiblings,
  copyFileChecked,
  listRegularFiles,
  manifestFiles,
  readJson,
  root,
  scanForInternalSpecifiers,
  stage,
  temporarySibling,
} from './lib.mjs';

const cliManifestPath = resolve(root, 'apps/cli/package.json');
const { parse } = createRequire(cliManifestPath)('yaml');
const workspacePath = resolve(root, 'pnpm-workspace.yaml');
const lockPath = resolve(root, 'pnpm-lock.yaml');
const cliOutput = resolve(root, 'apps/cli/dist');
const previewOutput = resolve(root, 'apps/preview/dist');
const manifestPath = resolve(previewOutput, '.vite/manifest.json');
const cliManifest = await readJson(cliManifestPath);
const workspace = parse(await readFile(workspacePath, 'utf8'));
const lock = parse(await readFile(lockPath, 'utf8'));

function publishManifest() {
  if (cliManifest.private === true)
    throw new Error('The authoritative CLI manifest must not be private');
  if (typeof cliManifest.name !== 'string' || typeof cliManifest.version !== 'string')
    throw new Error('CLI manifest name/version are required');
  if (cliManifest.bin === null || typeof cliManifest.bin !== 'object')
    throw new Error('CLI manifest bin is required');
  if (cliManifest.engines === null || typeof cliManifest.engines !== 'object')
    throw new Error('CLI manifest engines are required');
  for (const target of Object.values(cliManifest.bin)) {
    if (target !== 'dist/index.mjs')
      throw new Error(`Every package bin must target dist/index.mjs, received ${target}`);
  }

  const dependencies = {};
  const catalog = workspace.catalog;
  const lockCatalog = lock.catalogs?.default;
  const importer = lock.importers?.['apps/cli']?.dependencies;
  if (catalog === undefined || lockCatalog === undefined || importer === undefined)
    throw new Error('Catalog and apps/cli lock importer are required');

  for (const [name, sourceSpecifier] of Object.entries(cliManifest.dependencies ?? {})) {
    if (INTERNAL_SPECIFIERS.includes(name)) {
      if (!String(sourceSpecifier).startsWith('workspace:'))
        throw new Error(`Internal dependency ${name} must use workspace:`);
      continue;
    }
    if (sourceSpecifier !== 'catalog:')
      throw new Error(`Runtime dependency ${name} must use catalog:`);
    const version = catalog[name];
    if (typeof version !== 'string')
      throw new Error(`Runtime dependency ${name} is missing from the root catalog`);
    assertExactVersion(version, `Catalog version for ${name}`);
    const catalogLock = lockCatalog[name];
    if (catalogLock?.specifier !== version || catalogLock?.version !== version)
      throw new Error(`Lock catalog disagrees with ${name}@${version}`);
    const importLock = importer[name];
    if (importLock?.specifier !== 'catalog:' || bareLockVersion(importLock?.version) !== version)
      throw new Error(`CLI lock importer disagrees with ${name}@${version}`);
    const packageKey = `${name}@${version}`;
    if (
      !Object.keys(lock.packages ?? {}).some(
        (key) => key === packageKey || key.startsWith(`${packageKey}(`),
      )
    ) {
      throw new Error(`Lockfile has no registry package resolution for ${packageKey}`);
    }
    dependencies[name] = version;
  }

  const preserved = [
    'name',
    'version',
    'description',
    'keywords',
    'homepage',
    'bugs',
    'license',
    'author',
    'repository',
    'publishConfig',
    'type',
    'bin',
    'engines',
    'files',
    'schema',
  ];
  const result = Object.fromEntries(
    preserved.filter((key) => cliManifest[key] !== undefined).map((key) => [key, cliManifest[key]]),
  );
  result.dependencies = dependencies;
  const serialized = canonicalJson(result);
  if (/workspace:|catalog:/u.test(serialized))
    throw new Error('Publish manifest contains a workspace/catalog protocol');
  for (const name of INTERNAL_SPECIFIERS)
    if (serialized.includes(name))
      throw new Error(`Publish manifest contains internal package ${name}`);
  for (const forbidden of ['private', 'scripts', 'devDependencies', 'build', 'packageManager']) {
    if (Object.hasOwn(result, forbidden))
      throw new Error(`Publish manifest contains forbidden field ${forbidden}`);
  }
  return { result, serialized };
}

async function assemble() {
  await cleanEphemeralSiblings();
  const temporary = temporarySibling();
  const backup = temporarySibling('.package-tmp-backup-');
  let movedOld = false;
  try {
    await mkdir(temporary, { recursive: false });
    const cliFiles = await listRegularFiles(cliOutput);
    const expectedCli = ['index.mjs', 'index.mjs.map'];
    if (JSON.stringify(cliFiles) !== JSON.stringify(expectedCli))
      throw new Error(
        `CLI build output must be exactly ${expectedCli.join(', ')}, received ${cliFiles.join(', ')}`,
      );
    const entry = await readFile(resolve(cliOutput, 'index.mjs'), 'utf8');
    if (!entry.startsWith('#!/usr/bin/env node'))
      throw new Error('Built CLI entry is missing its Node shebang');

    const viteManifest = await readJson(manifestPath);
    const selected = manifestFiles(viteManifest);
    const previewFiles = await listRegularFiles(previewOutput);
    const allowedPreview = ['.vite/manifest.json', 'index.html', ...selected].sort();
    if (JSON.stringify(previewFiles) !== JSON.stringify(allowedPreview)) {
      throw new Error(
        `Preview output contains stale/orphan/missing files; expected ${allowedPreview.join(', ')}, received ${previewFiles.join(', ')}`,
      );
    }
    if (previewFiles.some((file) => file.endsWith('.map')))
      throw new Error('Preview output must not contain source maps');

    const { serialized } = publishManifest();
    await mkdir(resolve(temporary, 'dist/preview/.vite'), { recursive: true });
    await mkdir(resolve(temporary, 'schema'), { recursive: true });
    await copyFileChecked(resolve(cliOutput, 'index.mjs'), resolve(temporary, 'dist/index.mjs'));
    await chmod(resolve(temporary, 'dist/index.mjs'), 0o755);
    await copyFileChecked(
      resolve(previewOutput, 'index.html'),
      resolve(temporary, 'dist/preview/index.html'),
    );
    for (const file of selected)
      await copyFileChecked(
        resolve(previewOutput, ...file.split('/')),
        resolve(temporary, 'dist/preview', ...file.split('/')),
      );
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(
        resolve(temporary, 'dist/preview/.vite/manifest.json'),
        canonicalJson(viteManifest),
      ),
    );
    await copyFileChecked(
      resolve(root, 'schema/questspec-1.json'),
      resolve(temporary, 'schema/questspec-1.json'),
    );
    await copyFileChecked(resolve(root, 'README.md'), resolve(temporary, 'README.md'));
    await copyFileChecked(resolve(root, 'LICENSE'), resolve(temporary, 'LICENSE'));
    await copyFileChecked(
      resolve(root, 'THIRD_PARTY_NOTICES.md'),
      resolve(temporary, 'THIRD_PARTY_NOTICES.md'),
    );
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(resolve(temporary, 'package.json'), serialized),
    );
    await scanForInternalSpecifiers(temporary);

    try {
      await rename(stage, backup);
      movedOld = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    try {
      await rename(temporary, stage);
    } catch (error) {
      if (movedOld) await rename(backup, stage);
      throw error;
    }
    if (movedOld) await rm(backup, { recursive: true, force: true });
    console.log(`Assembled ${cliManifest.name}@${cliManifest.version} at ${stage}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
  }
}

await assemble();
