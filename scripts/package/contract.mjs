import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  INTERNAL_SPECIFIERS,
  listRegularFiles,
  readJson,
  scanForInternalSpecifiers,
  stage,
  tarballAllowlist,
} from './lib.mjs';

const manifest = await readJson(resolve(stage, 'package.json'));
const viteManifest = await readJson(resolve(stage, 'dist/preview/.vite/manifest.json'));
const expected = tarballAllowlist(viteManifest);
const actual = await listRegularFiles(stage);
if (JSON.stringify(actual) !== JSON.stringify(expected))
  throw new Error(
    `Staged allowlist mismatch\nexpected: ${expected.join('\n')}\nactual: ${actual.join('\n')}`,
  );
if (manifest.name !== 'questspec' || manifest.version !== '0.1.0')
  throw new Error('Unexpected package identity');
if (manifest.bin?.questspec !== 'dist/index.mjs')
  throw new Error('Packed bin does not target the staged Node bundle');
if (manifest.engines?.node !== '^24.0.0 || >=26.0.0')
  throw new Error('Unexpected packed Node engine contract');
if (manifest.schema !== 'schema/questspec-1.json')
  throw new Error('Packed schema metadata is missing');
if (
  manifest.private !== undefined ||
  manifest.scripts !== undefined ||
  manifest.devDependencies !== undefined
)
  throw new Error('Publish manifest contains repository-only fields');
for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
  if (INTERNAL_SPECIFIERS.includes(name) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version))
    throw new Error(`Invalid published dependency ${name}@${version}`);
}
await scanForInternalSpecifiers(stage);

const destination = await mkdtemp(join(tmpdir(), 'questspec-pack-contract-'));
try {
  const output = execFileSync('npm', ['pack', '--json', '--pack-destination', destination], {
    cwd: stage,
    encoding: 'utf8',
  });
  const report = JSON.parse(output)[0];
  const tarFiles = report.files.map(({ path }) => path).sort();
  if (JSON.stringify(tarFiles) !== JSON.stringify(expected))
    throw new Error(
      `Tarball allowlist mismatch\nexpected: ${expected.join('\n')}\nactual: ${tarFiles.join('\n')}`,
    );
  if (report.name !== manifest.name || report.version !== manifest.version)
    throw new Error('npm pack identity disagrees with staged manifest');
  if (!(await readFile(resolve(stage, 'LICENSE'), 'utf8')).includes('MIT License'))
    throw new Error('MIT license text missing');
  const notices = await readFile(resolve(stage, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  for (const required of ['React 19.2.8', 'd3-zoom 3.0.0', 'Meta Platforms', 'Mike Bostock']) {
    if (!notices.includes(required))
      throw new Error(`Third-party notice inventory is missing ${required}`);
  }
  console.log(
    `Package contract passed: ${report.filename}, ${report.entryCount} files, ${report.size} bytes, integrity ${report.integrity}`,
  );
} finally {
  await rm(destination, { recursive: true, force: true });
}
