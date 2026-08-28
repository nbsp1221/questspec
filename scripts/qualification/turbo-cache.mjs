import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'artifacts/qualification/turbo-cache.json');
const turboDirectory = resolve(root, '.turbo');
const ownedOutputs = ['apps/cli/dist', 'apps/preview/dist', 'dist', '.turbo'];
const expectedDryTasks = [
  '@questspec/core#transit',
  '@questspec/preview#build',
  '@questspec/preview#transit',
  '@questspec/preview-contract#transit',
  'questspec#build',
  'questspec#package',
  'questspec#transit',
];
const expectedExecutedTasks = ['@questspec/preview#build', 'questspec#build', 'questspec#package'];
const turbo = process.platform === 'win32' ? 'turbo.cmd' : 'turbo';

function runTurbo(arguments_) {
  execFileSync(turbo, arguments_, {
    cwd: root,
    env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
  });
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(actual)}`,
    );
  }
}

async function drySummary() {
  const output = execFileSync(
    turbo,
    ['run', 'build', 'package', '--filter=questspec', '--dry=json'],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1' },
    },
  );
  return JSON.parse(output);
}

async function executionSummary(previousRunIds) {
  const runsDirectory = resolve(turboDirectory, 'runs');
  const files = (await readdir(runsDirectory)).filter((file) => file.endsWith('.json')).sort();
  const file = files.find((candidate) => !previousRunIds.has(candidate));
  if (file === undefined) throw new Error('Turbo did not produce a new execution summary');
  return { file, summary: JSON.parse(await readFile(resolve(runsDirectory, file), 'utf8')) };
}

function taskProjection(summary) {
  return Object.fromEntries(
    summary.tasks.map((task) => [
      task.taskId,
      {
        cache: task.cache?.status ?? null,
        hash: task.hash,
        inputs: Object.keys(task.inputs ?? {}).sort(),
      },
    ]),
  );
}

function dryProjection(summary) {
  return Object.fromEntries(
    summary.tasks.map((task) => [
      task.taskId,
      {
        hash: task.hash,
        inputs: Object.keys(task.inputs ?? {}).sort(),
      },
    ]),
  );
}

function assertTaskSet(summary, expected, label) {
  assertEqual(
    summary.tasks.map(({ taskId }) => taskId).sort(),
    [...expected].sort(),
    `${label} task set changed`,
  );
}

function assertNoOwnedInputs(summary, label) {
  for (const task of summary.tasks) {
    for (const input of Object.keys(task.inputs ?? {})) {
      const normalized = input.replaceAll('\\', '/').replace(/^\.\.\/\.\.\//u, '');
      if (
        ownedOutputs.some((output) => normalized === output || normalized.startsWith(`${output}/`))
      ) {
        throw new Error(`${label} ${task.taskId} consumes owned output ${input}`);
      }
    }
  }
}

await Promise.all(
  ownedOutputs.map((output) => rm(resolve(root, output), { force: true, recursive: true })),
);

const dryBefore = await drySummary();
if (dryBefore.turboVersion !== '2.10.12') {
  throw new Error(`Cache qualification requires Turbo 2.10.12, received ${dryBefore.turboVersion}`);
}
assertTaskSet(dryBefore, expectedDryTasks, 'Dry graph');
assertNoOwnedInputs(dryBefore, 'Dry graph');

const knownRuns = new Set();
runTurbo([
  'run',
  'build',
  'package',
  '--filter=questspec',
  '--cache-dir=.turbo/cache',
  '--summarize=true',
]);
const first = await executionSummary(knownRuns);
knownRuns.add(first.file);
assertTaskSet(first.summary, expectedExecutedTasks, 'First run');
assertEqual(first.summary.execution?.attempted, 3, 'First run attempted count changed');
assertEqual(first.summary.execution?.cached, 0, 'First run must be entirely uncached');
assertEqual(
  first.summary.tasks.map((task) => task.cache?.status),
  ['MISS', 'MISS', 'MISS'],
  'First run cache statuses changed',
);
assertNoOwnedInputs(first.summary, 'First run');

const dryAfterFirst = await drySummary();
assertTaskSet(dryAfterFirst, expectedDryTasks, 'Post-build dry graph');
assertNoOwnedInputs(dryAfterFirst, 'Post-build dry graph');
assertEqual(
  dryProjection(dryAfterFirst),
  dryProjection(dryBefore),
  'Build/package outputs fed back into task or transit hashes',
);

runTurbo([
  'run',
  'build',
  'package',
  '--filter=questspec',
  '--cache-dir=.turbo/cache',
  '--summarize=true',
]);
const second = await executionSummary(knownRuns);
assertTaskSet(second.summary, expectedExecutedTasks, 'Second run');
assertEqual(second.summary.execution?.attempted, 3, 'Second run attempted count changed');
assertEqual(second.summary.execution?.cached, 3, 'Second run must be entirely cached');
assertEqual(
  second.summary.tasks.map((task) => task.cache?.status),
  ['HIT', 'HIT', 'HIT'],
  'Second run cache statuses changed',
);
assertEqual(
  Object.fromEntries(first.summary.tasks.map((task) => [task.taskId, task.hash])),
  Object.fromEntries(second.summary.tasks.map((task) => [task.taskId, task.hash])),
  'Unchanged second run produced different task hashes',
);

const report = {
  dryGraph: {
    taskCount: dryBefore.tasks.length,
    tasks: dryProjection(dryBefore),
  },
  firstRun: {
    cached: first.summary.execution.cached,
    taskCount: first.summary.execution.attempted,
    tasks: taskProjection(first.summary),
  },
  qualification: {
    cleanFirstRun: 'all-miss',
    outputInputFeedback: false,
    unchangedSecondRun: 'all-hit',
  },
  schemaVersion: 1,
  secondRun: {
    cached: second.summary.execution.cached,
    taskCount: second.summary.execution.attempted,
    tasks: taskProjection(second.summary),
  },
  turboVersion: dryBefore.turboVersion,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Turbo cache qualification passed; report: ${reportPath}`);
