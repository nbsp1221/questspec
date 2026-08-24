import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

const cliEntry = fileURLToPath(new URL('../src/index.ts', import.meta.url));

function runCli(args: string[], cwd?: string): { stderr: string; stdout: string; status: number } {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });

  return {
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim(),
    status: result.status ?? -1,
  };
}

const validQuestSpec = `
questspec: 1
target:
  minecraft: 1.21.1
  loader: neoforge@21.1.248
  questSystem: ftbquests@2101.1.33
  serializer: ftblibrary@2101.1.35
  dataVersion: 13
locales:
  default: en_us
  supported: [en_us, ko_kr]
groups:
  - key: industry
    title:
      en_us: Industry
      ko_kr: 산업
chapters:
  - key: foundations
    group: industry
    filename: 01_foundations
    title:
      en_us: Foundations
      ko_kr: 기초
    icon: minecraft:iron_pickaxe
    quests:
      - key: start
        title:
          en_us: Start
          ko_kr: 시작
        x: 0
        y: 0
        tasks:
          - key: log
            type: item
            item: minecraft:oak_log
`;

describe('questspec CLI', () => {
  it('prints usage and exits successfully', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`questspec/${pkg.version}`);
    expect(result.stdout).toContain('Usage:');
  });

  it('prints its version', () => {
    const result = runCli(['--version']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(new RegExp(`^questspec/${pkg.version.replaceAll('.', '\\.')} `));
  });

  it('fails on an unknown option', () => {
    const result = runCli(['--unknown']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown option');
  });

  it('fails on an unknown command', () => {
    const result = runCli(['unknown']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unknown command 'unknown'");
  });

  it('validates a source file and reports its exact target profile', () => {
    const root = mkdtempSync(join(tmpdir(), 'questspec-cli-'));
    writeFileSync(join(root, 'quests.yml'), validQuestSpec);

    const result = runCli(['validate', 'quests.yml'], root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Valid:');
    expect(result.stdout).toContain('ftbquests@2101.1.33');
  });

  it('emits machine-readable diagnostics for invalid source', () => {
    const root = mkdtempSync(join(tmpdir(), 'questspec-cli-'));
    writeFileSync(join(root, 'invalid.yml'), 'questspec: 2\n');

    const result = runCli(['validate', 'invalid.yml', '--json'], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'SPEC_SCHEMA', severity: 'error' })]),
    );
  });

  it('optionally validates references against an exact-runtime resource catalog', () => {
    const root = mkdtempSync(join(tmpdir(), 'questspec-cli-'));
    writeFileSync(join(root, 'quests.yml'), validQuestSpec);
    writeFileSync(
      join(root, 'resources.json'),
      JSON.stringify({
        advancements: {},
        items: ['minecraft:iron_pickaxe'],
        target: {
          dataVersion: 13,
          loader: 'neoforge@21.1.248',
          minecraft: '1.21.1',
          questSystem: 'ftbquests@2101.1.33',
          serializer: 'ftblibrary@2101.1.35',
        },
      }),
    );

    const result = runCli(
      ['validate', 'quests.yml', '--resources', 'resources.json', '--json'],
      root,
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual([
      expect.objectContaining({ code: 'RESOURCE_UNKNOWN_ITEM', file: join(root, 'quests.yml') }),
    ]);
  });

  it('compiles atomically and requires force to replace output', () => {
    const root = mkdtempSync(join(tmpdir(), 'questspec-cli-'));
    writeFileSync(join(root, 'quests.yml'), validQuestSpec);

    const first = runCli(['compile', 'quests.yml', '--output', 'generated'], root);
    expect(first.status).toBe(0);
    expect(readFileSync(join(root, 'generated/data.snbt'), 'utf8')).toContain('version: 13');

    writeFileSync(join(root, 'generated/marker.txt'), 'keep');
    const refused = runCli(['compile', 'quests.yml', '--output', 'generated'], root);
    expect(refused.status).toBe(1);
    expect(readFileSync(join(root, 'generated/marker.txt'), 'utf8')).toBe('keep');

    const replaced = runCli(['compile', 'quests.yml', '--output', 'generated', '--force'], root);
    expect(replaced.status).toBe(0);
    expect(existsSync(join(root, 'generated/marker.txt'))).toBe(false);
  });

  it('imports a generated directory with an ID map and semantically diffs it', () => {
    const root = mkdtempSync(join(tmpdir(), 'questspec-cli-'));
    writeFileSync(join(root, 'quests.yml'), validQuestSpec);
    expect(runCli(['compile', 'quests.yml', '--output', 'generated'], root).status).toBe(0);

    const imported = runCli(['import', 'generated', '--output', 'imported.yml'], root);
    expect(imported.status).toBe(0);
    expect(readFileSync(join(root, 'imported.yml'), 'utf8')).toContain('questspec: 1');
    expect(existsSync(join(root, 'imported.ids.json'))).toBe(true);

    writeFileSync(join(root, 'blocked.ids.json'), '{}\n');
    const blocked = runCli(['import', 'generated', '--output', 'blocked.yml'], root);
    expect(blocked.status).toBe(1);
    expect(existsSync(join(root, 'blocked.yml'))).toBe(false);

    const diff = runCli(['diff', 'imported.yml', 'generated'], root);
    expect(diff.status).toBe(0);
    expect(diff.stdout).toContain('No semantic differences');
  });
});
