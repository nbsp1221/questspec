import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
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

  it('analyzes a source with a bounded structural JSON report', () => {
    const root = mkdtempSync(join(tmpdir(), 'questspec-cli-'));
    writeFileSync(join(root, 'quests.yml'), validQuestSpec);

    const result = runCli(
      ['analyze', 'quests.yml', '--from', 'foundations.start', '--max-depth', '0', '--json'],
      root,
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout) as unknown as Record<string, unknown>;
    expect(report).toMatchObject({
      direction: 'dependents',
      graph: { edgeCount: 0, nodeCount: 1, maximumDepth: 0 },
      partial: false,
      query: {
        direction: 'dependents',
        from: 'foundations.start',
        maxDepth: 0,
        reachable: [{ distance: 0, key: 'foundations.start' }],
      },
      source: realpathSync(join(root, 'quests.yml')),
      valid: true,
    });
    expect(report.target).toMatchObject({ questSystem: 'ftbquests@2101.1.33' });
  });

  it('rejects analyze option dependencies before loading the source', () => {
    const root = mkdtempSync(join(tmpdir(), 'questspec-cli-'));
    writeFileSync(join(root, 'quests.yml'), validQuestSpec);

    const result = runCli(['analyze', 'quests.yml', '--to', 'foundations.start'], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--to requires --from');
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
      expect.objectContaining({
        code: 'RESOURCE_UNKNOWN_ITEM',
        file: realpathSync(join(root, 'quests.yml')),
      }),
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

    const colliding = runCli(
      ['import', 'generated', '--output', 'collision.yml', '--id-map', 'collision.yml'],
      root,
    );
    expect(colliding.status).toBe(1);
    expect(existsSync(join(root, 'collision.yml'))).toBe(false);

    const diff = runCli(['diff', 'imported.yml', 'generated'], root);
    expect(diff.status).toBe(0);
    expect(diff.stdout).toContain('No semantic differences');
  });
});

it('reports target adapter failures consistently for import and diff', () => {
  const root = mkdtempSync(join(tmpdir(), 'questspec-cli-'));
  writeFileSync(join(root, 'quests.yml'), validQuestSpec);
  expect(runCli(['compile', 'quests.yml', '--output', 'generated'], root).status).toBe(0);

  writeFileSync(join(root, 'generated/data.snbt'), '{');
  const malformed = runCli(['import', 'generated', '--output', 'malformed.yml', '--json'], root);
  expect(malformed.status).toBe(1);
  expect(malformed.stderr).toBe('');
  expect(JSON.parse(malformed.stdout)).toEqual([
    expect.objectContaining({
      code: 'IMPORT_INVALID_SNBT',
      file: 'data.snbt',
      path: ['data.snbt'],
      severity: 'error',
    }),
  ]);
  expect(existsSync(join(root, 'malformed.yml'))).toBe(false);

  expect(runCli(['compile', 'quests.yml', '--output', 'generated', '--force'], root).status).toBe(
    0,
  );
  const chapterPath = join(root, 'generated/chapters/01_foundations.snbt');
  writeFileSync(
    chapterPath,
    readFileSync(chapterPath, 'utf8').replace(
      'filename: "01_foundations"',
      'filename: "01_foundations"\nfuture_field: true',
    ),
  );

  const jsonDiff = runCli(['diff', 'quests.yml', 'generated', '--json'], root);
  expect(jsonDiff.status).toBe(1);
  expect(jsonDiff.stderr).toBe('');
  expect(JSON.parse(jsonDiff.stdout)).toEqual([
    expect.objectContaining({
      code: 'IMPORT_UNSUPPORTED_FIELD',
      file: 'chapters/01_foundations.snbt.future_field',
      path: ['chapters/01_foundations.snbt.future_field'],
    }),
  ]);

  const humanImport = runCli(['import', 'generated', '--output', 'unsupported.yml'], root);
  expect(humanImport.status).toBe(1);
  expect(humanImport.stdout).toBe('');
  expect(humanImport.stderr).toContain(
    'chapters/01_foundations.snbt.future_field: error IMPORT_UNSUPPORTED_FIELD',
  );
});

it('maps the target adapter failure matrix through both import and diff JSON', () => {
  const root = mkdtempSync(join(tmpdir(), 'questspec-cli-'));
  writeFileSync(join(root, 'quests.yml'), validQuestSpec);
  const chapterPath = join(root, 'generated/chapters/01_foundations.snbt');
  const localePath = join(root, 'generated/lang/en_us.snbt');
  const cases: Array<{
    code: string;
    mutate: () => void;
    name: string;
    path: string;
  }> = [
    {
      code: 'IMPORT_MISSING_FILE',
      mutate: () => unlinkSync(join(root, 'generated/data.snbt')),
      name: 'missing-file',
      path: 'data.snbt',
    },
    {
      code: 'IMPORT_UNSUPPORTED_TYPE',
      mutate: () =>
        writeFileSync(
          chapterPath,
          readFileSync(chapterPath, 'utf8').replace('type: "item"', 'type: "fluid"'),
        ),
      name: 'unsupported-type',
      path: '.type',
    },
    {
      code: 'IMPORT_INVALID_FIELD',
      mutate: () =>
        writeFileSync(
          chapterPath,
          readFileSync(chapterPath, 'utf8').replace(
            /(\n\t\tx: 0\.0d)/u,
            '\n\t\tdependency_requirement: 1$1',
          ),
        ),
      name: 'invalid-value',
      path: '.dependency_requirement',
    },
    {
      code: 'IMPORT_INVALID_FIELD',
      mutate: () =>
        writeFileSync(
          localePath,
          readFileSync(localePath, 'utf8').replace(
            /(quest\.[^.]+\.title): "Start"/u,
            '$1: ["Start"]',
          ),
        ),
      name: 'wrong-shaped-translation',
      path: '.title',
    },
    {
      code: 'IMPORT_UNSUPPORTED_FIELD',
      mutate: () =>
        writeFileSync(
          localePath,
          readFileSync(localePath, 'utf8').replace(
            '{',
            '{\n\tquest.7000000000000001.title: "Orphan"',
          ),
        ),
      name: 'orphan-translation',
      path: 'quest.7000000000000001.title',
    },
  ];

  for (const testCase of cases) {
    expect(runCli(['compile', 'quests.yml', '--output', 'generated', '--force'], root).status).toBe(
      0,
    );
    testCase.mutate();

    for (const args of [
      ['import', 'generated', '--output', `${testCase.name}.yml`, '--json'],
      ['diff', 'quests.yml', 'generated', '--json'],
    ]) {
      const result = runCli(args, root);
      expect(result.status, `${testCase.name}: ${args[0]}`).toBe(1);
      expect(result.stderr, `${testCase.name}: ${args[0]}`).toBe('');
      const diagnostics = JSON.parse(result.stdout) as Array<{ code: string; path: string[] }>;
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe(testCase.code);
      expect(diagnostics[0].path).toHaveLength(1);
      expect(diagnostics[0].path[0]).toContain(testCase.path);
    }
  }
}, 20_000);
