import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cliEntry = fileURLToPath(new URL('../../apps/cli/src/index.ts', import.meta.url));

function runAnalyze(
  source: string,
  args: string[] = [],
): {
  stderr: string;
  stdout: string;
  status: number;
} {
  const root = mkdtempSync(join(tmpdir(), 'questspec-analyze-'));
  const sourcePath = join(root, 'quests.yml');
  writeFileSync(sourcePath, source);
  const result = spawnSync(process.execPath, [cliEntry, 'analyze', sourcePath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim(),
    status: result.status ?? -1,
  };
}

interface AnalyzeJsonReport extends Record<string, unknown> {
  diagnostics: unknown[];
  query: unknown;
  valid: boolean;
}

function parseJson(output: string): AnalyzeJsonReport {
  return JSON.parse(output) as AnalyzeJsonReport;
}

function hasDiagnostic(report: AnalyzeJsonReport, code: string): boolean {
  return report.diagnostics.some(
    (diagnostic) =>
      typeof diagnostic === 'object' &&
      diagnostic !== null &&
      'code' in diagnostic &&
      diagnostic.code === code,
  );
}

function questbook(quests: string, extras = ''): string {
  return `
questspec: 1
target:
  minecraft: 1.21.1
  loader: neoforge@21.1.248
  questSystem: ftbquests@2101.1.33
  serializer: ftblibrary@2101.1.35
  dataVersion: 13
locales:
  default: en_us
  supported: [en_us]
groups:
  - key: g
chapters:
  - key: c
    group: g
    filename: 01_c
    title: {en_us: C}
    icon: minecraft:stone
    quests:
${quests}
${extras}`;
}

function multiChapterBook(chapters: string): string {
  return `
questspec: 1
target:
  minecraft: 1.21.1
  loader: neoforge@21.1.248
  questSystem: ftbquests@2101.1.33
  serializer: ftblibrary@2101.1.35
  dataVersion: 13
locales:
  default: en_us
  supported: [en_us]
groups:
  - key: g
chapters:
${chapters}`;
}

const chain = questbook(`      - key: a
        title: {en_us: A}
        x: 0
        y: 0
        tasks: [{key: a_task, type: checkmark}]
      - key: b
        title: {en_us: B}
        x: 1
        y: 0
        dependencies: [a]
        tasks: [{key: b_task, type: checkmark}]
      - key: c
        title: {en_us: C}
        x: 2
        y: 0
        dependencies: [b]
        tasks: [{key: c_task, type: checkmark}]`);

describe('questspec analyze CLI', () => {
  it('prints help and a complete deterministic summary envelope', () => {
    const result = spawnSync(process.execPath, [cliEntry, 'analyze', '--help'], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--direction');
    expect(result.stdout).toContain('--max-depth');

    const first = runAnalyze(chain, ['--json']);
    const second = runAnalyze(chain, ['--json']);
    expect(first.status).toBe(0);
    expect(parseJson(first.stdout)).toMatchObject({
      direction: 'dependents',
      graph: {
        edgeCount: 2,
        maximumDepth: 2,
        nodeCount: 3,
        roots: ['c.a'],
        leaves: ['c.c'],
        criticalPath: ['c.a', 'c.b', 'c.c'],
      },
      partial: false,
      query: null,
      valid: true,
    });
    const firstReport = parseJson(first.stdout);
    const secondReport = parseJson(second.stdout);
    expect(JSON.stringify({ ...firstReport, source: '<source>' }, undefined, 2)).toBe(
      JSON.stringify({ ...secondReport, source: '<source>' }, undefined, 2),
    );
  });

  it('supports inclusive bounded reachability and both path directions', () => {
    const reachability = runAnalyze(chain, ['--from', 'c.a', '--max-depth', '1', '--json']);
    expect(reachability.status).toBe(0);
    expect(parseJson(reachability.stdout).query).toEqual({
      direction: 'dependents',
      from: 'c.a',
      maxDepth: 1,
      reachable: [
        { distance: 0, key: 'c.a' },
        { distance: 1, key: 'c.b' },
      ],
    });

    const path = runAnalyze(chain, [
      '--from',
      'c.c',
      '--to',
      'c.a',
      '--direction',
      'dependencies',
      '--json',
    ]);
    expect(path.status).toBe(0);
    expect(parseJson(path.stdout).query).toEqual({
      direction: 'dependencies',
      from: 'c.c',
      path: ['c.c', 'c.b', 'c.a'],
      to: 'c.a',
    });
  });

  it('rejects every query option dependency with stable JSON diagnostics', () => {
    for (const args of [
      ['--to', 'c.a', '--json'],
      ['--max-depth', '1', '--json'],
      ['--from', 'c.a', '--to', 'c.c', '--max-depth', '1', '--json'],
      ['--from', 'c.a', '--direction', 'sideways', '--json'],
      ['--from', 'c.a', '--max-depth=-1', '--json'],
    ]) {
      const result = runAnalyze(chain, args);
      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      const report = parseJson(result.stdout);
      expect(report.valid).toBe(false);
      expect(report.diagnostics.length).toBeGreaterThan(0);
    }
  }, 15_000);

  it('reports cycles and missing edges while retaining partial structural output', () => {
    const cycle = questbook(`      - key: a
        title: {en_us: A}
        x: 0
        y: 0
        dependencies: [b]
        tasks: [{key: a_task, type: checkmark}]
      - key: b
        title: {en_us: B}
        x: 1
        y: 0
        dependencies: [a]
        tasks: [{key: b_task, type: checkmark}]`);
    const cycleResult = runAnalyze(cycle, ['--json']);
    expect(cycleResult.status).toBe(1);
    expect(parseJson(cycleResult.stdout)).toMatchObject({
      graph: { cycleComponents: [['c.a', 'c.b']], topologicalOrder: null },
      valid: false,
    });

    const missing = questbook(`      - key: a
        title: {en_us: A}
        x: 0
        y: 0
        dependencies: [missing]
        tasks: [{key: a_task, type: checkmark}]`);
    const missingResult = runAnalyze(missing, ['--json']);
    expect(missingResult.status).toBe(1);
    expect(parseJson(missingResult.stdout)).toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'GRAPH_MISSING_DEPENDENCY' })],
      graph: { edgeCount: 0, nodeCount: 1 },
      partial: true,
      valid: false,
    });
  });

  it('does not report identity ambiguity for a source that cannot be built', () => {
    const result = runAnalyze('questspec: 2\n', ['--from', 'c.a', '--json']);

    expect(result.status).toBe(1);
    expect(parseJson(result.stdout)).toMatchObject({
      graph: null,
      partial: false,
      valid: false,
    });
    expect(hasDiagnostic(parseJson(result.stdout), 'SPEC_SCHEMA')).toBe(true);
    expect(result.stdout).not.toContain('GRAPH_IDENTITY_AMBIGUOUS');
    expect(result.stdout).not.toContain('GRAPH_QUERY_GRAPH_UNAVAILABLE');
  });

  it('reports ambiguous identity when a query is requested', () => {
    const duplicate = questbook(`      - key: a
        title: {en_us: A}
        x: 0
        y: 0
        tasks: [{key: a_task, type: checkmark}]
      - key: a
        title: {en_us: A again}
        x: 1
        y: 0
        tasks: [{key: a_task_2, type: checkmark}]`);
    const result = runAnalyze(duplicate, ['--from', 'c.a', '--json']);
    const report = parseJson(result.stdout);

    expect(result.status).toBe(1);
    expect(report.graph).toBeNull();
    expect(report.query).toMatchObject({ reachable: null });
    expect(hasDiagnostic(report, 'IDENTITY_DUPLICATE')).toBe(true);
    expect(hasDiagnostic(report, 'GRAPH_QUERY_GRAPH_UNAVAILABLE')).toBe(true);
  });

  it('keeps complete JSON byte-identical across chapter, quest, and dependency permutations', () => {
    const first = multiChapterBook(`  - key: one
    group: g
    filename: 01_one
    title: {en_us: One}
    icon: minecraft:stone
    quests:
      - key: root_a
        title: {en_us: A}
        x: 0
        y: 0
        tasks: [{key: task_a, type: checkmark}]
      - key: root_b
        title: {en_us: B}
        x: 1
        y: 0
        tasks: [{key: task_b, type: checkmark}]
  - key: two
    group: g
    filename: 02_two
    title: {en_us: Two}
    icon: minecraft:stone
    quests:
      - key: finish
        title: {en_us: Finish}
        x: 2
        y: 0
        dependencies: [one.root_a, one.root_b]
        tasks: [{key: task_finish, type: checkmark}]`);
    const second = multiChapterBook(`  - key: two
    group: g
    filename: 02_two
    title: {en_us: Two}
    icon: minecraft:stone
    quests:
      - key: finish
        title: {en_us: Finish}
        x: 2
        y: 0
        dependencies: [one.root_b, one.root_a]
        tasks: [{key: task_finish, type: checkmark}]
  - key: one
    group: g
    filename: 01_one
    title: {en_us: One}
    icon: minecraft:stone
    quests:
      - key: root_b
        title: {en_us: B}
        x: 1
        y: 0
        tasks: [{key: task_b, type: checkmark}]
      - key: root_a
        title: {en_us: A}
        x: 0
        y: 0
        tasks: [{key: task_a, type: checkmark}]`);
    const firstResult = runAnalyze(first, ['--json']);
    const secondResult = runAnalyze(second, ['--json']);

    expect(firstResult.status).toBe(0);
    expect(secondResult.status).toBe(0);
    expect(
      JSON.stringify({ ...parseJson(firstResult.stdout), source: '<source>' }, undefined, 2),
    ).toBe(JSON.stringify({ ...parseJson(secondResult.stdout), source: '<source>' }, undefined, 2));
  });

  it('bounds human output for large key collections', () => {
    const large = questbook(
      Array.from(
        { length: 30 },
        (_, index) => `      - key: q${String(index).padStart(2, '0')}
        title: {en_us: Q${index}}
        x: ${index}
        y: 0
        tasks: [{key: task, type: checkmark}]`,
      ).join('\n'),
    );
    const result = runAnalyze(large);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('… (+10 more)');
    expect(result.stdout.length).toBeLessThan(5000);
  });
});
