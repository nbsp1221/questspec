import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { type CAC, cac } from 'cac';
import pkg from '../package.json' with { type: 'json' };
import type { Diagnostic } from './diagnostics/diagnostic.ts';
import type { Questbook } from './ir/questbook.ts';
import type { YamlSourceMap } from './spec/source-map.ts';
import { reportDiagnostics } from './diagnostics/reporter.ts';
import { writeDirectoryAtomic, writeFileSetAtomic } from './filesystem/atomic-output.ts';
import { readSnbtDirectory } from './filesystem/read-directory.ts';
import {
  QUEST_GRAPH_QUERY_INVALID_DEPTH,
  QUEST_GRAPH_QUERY_INVALID_DIRECTION,
  type QuestGraphDirection,
  type QuestGraphSummary,
  type QuestReachability,
  compareQuestKeys,
  queryReachability,
  queryShortestPath,
} from './graph/index.ts';
import {
  defaultPhysicalIdMapPath,
  readPhysicalIdMap,
  serializePhysicalIdMap,
} from './identity/id-map.ts';
import { type LoadQuestbookGraphState, loadQuestbook } from './spec/load.ts';
import { serializeQuestbook } from './spec/serialize.ts';
import {
  FtbQuestbookImportError,
  decodeFtbQuests2101,
} from './targets/ftbquests-2101.1.33/decode.ts';
import {
  FtbQuestbookCompilationError,
  compileFtbQuests2101,
} from './targets/ftbquests-2101.1.33/encode.ts';
import { ftbQuests2101Profile } from './targets/ftbquests-2101.1.33/profile.ts';
import { parseResourceCatalog, validateQuestbookResources } from './validation/resources.ts';

interface CommonOptions {
  json?: boolean;
  resources?: string;
}

interface CompileOptions extends CommonOptions {
  force?: boolean;
  idMap?: string;
  output: string;
}

interface ImportOptions extends CommonOptions {
  force?: boolean;
  idMap?: string;
  output: string;
}

interface DiffOptions extends CommonOptions {
  idMap?: string;
}

interface AnalyzeOptions extends CommonOptions {
  direction?: string;
  from?: string;
  maxDepth?: number | string;
  to?: string;
}

interface AnalyzeReachabilityQuery {
  direction: QuestGraphDirection;
  from: string;
  maxDepth: number | null;
  reachable: QuestReachability[] | null;
}

interface AnalyzePathQuery {
  direction: QuestGraphDirection;
  from: string;
  path: string[] | null;
  to: string;
}

interface AnalyzeReport {
  diagnostics: Diagnostic[];
  direction: QuestGraphDirection;
  graph: QuestGraphSummary | null;
  partial: boolean;
  query: AnalyzePathQuery | AnalyzeReachabilityQuery | null;
  source: string;
  target: typeof ftbQuests2101Profile;
  valid: boolean;
}

export function createCli(): CAC {
  const cli = cac('questspec');

  cli
    .command('validate <source>', 'Validate a declarative QuestSpec YAML file')
    .option('--json', 'Write diagnostics as JSON')
    .option('--resources <catalog>', 'Validate references against an exact-runtime catalog')
    .action(async (source: string, options: CommonOptions) => {
      const sourcePath = resolve(source);
      const questbook = await loadValidatedSource(sourcePath, options);
      if (questbook === undefined) {
        return;
      }
      if (options.json) {
        console.log(
          JSON.stringify(
            { source: sourcePath, target: ftbQuests2101Profile, valid: true },
            undefined,
            2,
          ),
        );
      } else {
        console.log(`Valid: ${sourcePath}`);
        console.log(`Target: ${targetLabel()}`);
      }
    });

  cli
    .command('analyze <source>', 'Analyze the structural quest dependency graph')
    .option('--from <quest>', 'Start quest for reachability or path analysis')
    .option('--to <quest>', 'End quest for shortest-path analysis (requires --from)')
    .option('--direction <direction>', 'Traversal direction: dependents or dependencies')
    .option('--max-depth <integer>', 'Inclusive reachability depth bound (requires --from)')
    .option('--json', 'Write the complete analysis as JSON')
    .action(async (source: string, options: AnalyzeOptions) => {
      const sourcePath = resolve(source);
      const optionDiagnostics = validateAnalyzeOptions(options);
      if (optionDiagnostics.length > 0) {
        printAnalyzeOptionFailure(sourcePath, options, optionDiagnostics);
        return;
      }

      const loaded = await loadSource(sourcePath);
      const direction = normalizeDirection(options.direction);
      const maxDepth = parseAnalyzeDepth(options.maxDepth)!;
      const query = createAnalyzeQuery(
        loaded.graphState,
        options,
        direction,
        maxDepth,
        sourcePath,
        loaded.sourceMap,
      );
      const diagnostics = [...loaded.diagnostics, ...query.diagnostics];
      const report: AnalyzeReport = {
        diagnostics,
        direction,
        graph: loaded.graphState.kind === 'available' ? loaded.graphState.summary : null,
        partial: loaded.graphState.kind === 'available' && loaded.graphState.partial,
        query: query.value,
        source: sourcePath,
        target: ftbQuests2101Profile,
        valid: diagnostics.length === 0,
      };

      if (options.json) {
        console.log(JSON.stringify(report, undefined, 2));
      } else {
        console.log(formatAnalyzeReport(report));
        if (diagnostics.length > 0) {
          reportDiagnostics(diagnostics, false);
        }
      }
      if (diagnostics.length > 0) {
        process.exitCode = 1;
      }
    });

  cli
    .command('compile <source>', 'Compile QuestSpec YAML into an FTB Quests directory')
    .option('-o, --output <directory>', 'Generated FTB Quests directory')
    .option('--id-map <file>', 'Physical ID map (defaults beside the source)')
    .option('--force', 'Replace an existing output directory')
    .option('--json', 'Write diagnostics as JSON')
    .option('--resources <catalog>', 'Validate references against an exact-runtime catalog')
    .action(async (source: string, options: CompileOptions) => {
      if (options.output === undefined) {
        throw new Error('questspec compile: --output is required');
      }
      const sourcePath = resolve(source);
      const questbook = await loadValidatedSource(sourcePath, options);
      if (questbook === undefined) {
        return;
      }
      const idMapPath = resolve(options.idMap ?? defaultPhysicalIdMapPath(sourcePath));
      const importedIds = await readPhysicalIdMap(idMapPath);
      let compiled;
      try {
        compiled = compileFtbQuests2101(questbook, importedIds);
      } catch (error) {
        if (error instanceof FtbQuestbookCompilationError && error.diagnostics.length > 0) {
          acceptDiagnostics(error.diagnostics, options);
          return;
        }
        throw error;
      }
      const output = resolve(options.output);
      await writeDirectoryAtomic(compiled.files, output, { overwrite: options.force });
      if (options.json) {
        console.log(
          JSON.stringify(
            { files: compiled.files.size, output, target: ftbQuests2101Profile },
            undefined,
            2,
          ),
        );
      } else {
        console.log(`Compiled ${compiled.files.size} files to ${output}`);
        console.log(`Target: ${targetLabel()}`);
      }
    });

  cli
    .command('import <directory>', 'Import an FTB Quests directory into QuestSpec YAML')
    .option('-o, --output <file>', 'QuestSpec YAML destination')
    .option('--id-map <file>', 'Physical ID map destination')
    .option('--force', 'Replace existing source and ID-map files')
    .option('--json', 'Write diagnostics as JSON')
    .action(async (directory: string, options: ImportOptions) => {
      if (options.output === undefined) {
        throw new Error('questspec import: --output is required');
      }
      const output = resolve(options.output);
      const idMapPath = resolve(options.idMap ?? defaultPhysicalIdMapPath(output));
      if (output === idMapPath) {
        throw new Error(
          'questspec import: source output and physical ID map must be different files',
        );
      }
      const knownIds = await readPhysicalIdMap(idMapPath);
      const imported = decodeTarget(await readSnbtDirectory(resolve(directory)), knownIds, options);
      if (imported === undefined) {
        return;
      }
      await writeFileSetAtomic(
        new Map([
          [output, serializeQuestbook(imported.questbook)],
          [idMapPath, serializePhysicalIdMap(imported.ids)],
        ]),
        { overwrite: options.force },
      );
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              idMap: idMapPath,
              input: resolve(directory),
              output,
              target: ftbQuests2101Profile,
            },
            undefined,
            2,
          ),
        );
      } else {
        console.log(`Imported ${resolve(directory)} to ${output}`);
        console.log(`ID map: ${idMapPath}`);
        console.log(`Target: ${targetLabel()}`);
      }
    });

  cli
    .command('diff <source> <directory>', 'Compare source with an FTB directory semantically')
    .option('--id-map <file>', 'Physical ID map (defaults beside the source)')
    .option('--json', 'Write differences as JSON')
    .action(async (source: string, directory: string, options: DiffOptions) => {
      const sourcePath = resolve(source);
      const loaded = await loadSource(sourcePath);
      if (!acceptDiagnostics(loaded.diagnostics, options) || loaded.questbook === undefined) {
        return;
      }
      const ids = await readPhysicalIdMap(
        resolve(options.idMap ?? defaultPhysicalIdMapPath(sourcePath)),
      );
      const expectedCompiled = compileFtbQuests2101(loaded.questbook, ids);
      const expectedImport = decodeTarget(expectedCompiled.files, expectedCompiled.ids, options);
      if (expectedImport === undefined) {
        return;
      }
      const actualImport = decodeTarget(
        await readSnbtDirectory(resolve(directory)),
        expectedCompiled.ids,
        options,
      );
      if (actualImport === undefined) {
        return;
      }
      const differences = collectDifferences(expectedImport.questbook, actualImport.questbook);
      if (differences.length === 0) {
        if (options.json) {
          console.log('[]');
        } else {
          console.log('No semantic differences');
        }
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(differences, undefined, 2));
      } else {
        console.log(`Semantic differences (${differences.length}):`);
        for (const difference of differences) {
          console.log(`- ${difference}`);
        }
      }
      process.exitCode = 1;
    });

  cli
    .command('[...args]', 'Compile and validate declarative Minecraft questbooks')
    .action((args: string[]) => {
      if (args.length > 0) {
        throw new Error(`questspec: unknown command '${args[0]}'`);
      }
      cli.outputHelp();
    });

  cli.help().version(pkg.version);
  return cli;
}

interface LoadedSource {
  diagnostics: Diagnostic[];
  graphState: LoadQuestbookGraphState;
  questbook?: Questbook;
  sourceMap: YamlSourceMap;
}

function validateAnalyzeOptions(options: AnalyzeOptions): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (
    options.direction !== undefined &&
    options.direction !== 'dependents' &&
    options.direction !== 'dependencies'
  ) {
    diagnostics.push({
      code: QUEST_GRAPH_QUERY_INVALID_DIRECTION,
      message: `Invalid graph query direction ${JSON.stringify(options.direction)}`,
      path: ['direction'],
      severity: 'error',
    });
  }

  const hasFrom = options.from !== undefined;
  const hasTo = options.to !== undefined;
  const hasMaxDepth = options.maxDepth !== undefined;
  if (hasTo && !hasFrom) {
    diagnostics.push({
      code: 'CLI_ANALYZE_TO_REQUIRES_FROM',
      message: 'questspec analyze: --to requires --from',
      path: ['to'],
      severity: 'error',
    });
  }
  if (hasMaxDepth && !hasFrom) {
    diagnostics.push({
      code: 'CLI_ANALYZE_MAX_DEPTH_REQUIRES_FROM',
      message: 'questspec analyze: --max-depth requires --from',
      path: ['max-depth'],
      severity: 'error',
    });
  }
  if (hasMaxDepth && hasTo) {
    diagnostics.push({
      code: 'CLI_ANALYZE_MAX_DEPTH_WITH_TO',
      message:
        'questspec analyze: --max-depth applies only to reachability and cannot be combined with --to',
      path: ['max-depth'],
      severity: 'error',
    });
  }
  if (hasMaxDepth && parseAnalyzeDepth(options.maxDepth) === undefined) {
    diagnostics.push({
      code: QUEST_GRAPH_QUERY_INVALID_DEPTH,
      message: 'questspec analyze: --max-depth must be a non-negative safe integer',
      path: ['max-depth'],
      severity: 'error',
    });
  }
  return diagnostics;
}

function printAnalyzeOptionFailure(
  sourcePath: string,
  options: AnalyzeOptions,
  diagnostics: Diagnostic[],
): void {
  if (options.json) {
    const report: AnalyzeReport = {
      diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic, file: sourcePath })),
      direction: normalizeDirection(options.direction),
      graph: null,
      partial: false,
      query: null,
      source: sourcePath,
      target: ftbQuests2101Profile,
      valid: false,
    };
    console.log(JSON.stringify(report, undefined, 2));
  } else {
    reportDiagnostics(
      diagnostics.map((diagnostic) => ({ ...diagnostic, file: sourcePath })),
      false,
    );
  }
  process.exitCode = 1;
}

function normalizeDirection(value: string | undefined): QuestGraphDirection {
  return value === 'dependencies' ? 'dependencies' : 'dependents';
}

function parseAnalyzeDepth(value: number | string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (!/^\d+$/u.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function createAnalyzeQuery(
  graphState: LoadQuestbookGraphState,
  options: AnalyzeOptions,
  direction: QuestGraphDirection,
  maxDepth: number | undefined,
  sourcePath: string,
  sourceMap: YamlSourceMap,
): { diagnostics: Diagnostic[]; value: AnalyzePathQuery | AnalyzeReachabilityQuery | null } {
  if (options.from === undefined) {
    return { diagnostics: [], value: null };
  }

  if (options.to !== undefined) {
    const value: AnalyzePathQuery = {
      direction,
      from: options.from,
      path: null,
      to: options.to,
    };
    if (graphState.kind !== 'available') {
      return unavailableGraphQuery(graphState, value, sourcePath, sourceMap);
    }
    const result = queryShortestPath(graphState.graph, {
      direction,
      from: options.from,
      to: options.to,
    });
    value.path = result.result;
    return {
      diagnostics: addQuerySource(result.diagnostics, sourcePath, sourceMap),
      value,
    };
  }

  const value: AnalyzeReachabilityQuery = {
    direction,
    from: options.from,
    maxDepth: maxDepth ?? null,
    reachable: null,
  };
  if (graphState.kind !== 'available') {
    return unavailableGraphQuery(graphState, value, sourcePath, sourceMap);
  }
  const result = queryReachability(graphState.graph, {
    direction,
    from: [options.from],
    ...(maxDepth === undefined ? {} : { maxDepth }),
  });
  value.reachable = result.result;
  return {
    diagnostics: addQuerySource(result.diagnostics, sourcePath, sourceMap),
    value,
  };
}

function unavailableGraphQuery(
  graphState: LoadQuestbookGraphState,
  value: AnalyzePathQuery | AnalyzeReachabilityQuery,
  sourcePath: string,
  sourceMap: YamlSourceMap,
): { diagnostics: Diagnostic[]; value: AnalyzePathQuery | AnalyzeReachabilityQuery } {
  if (graphState.kind === 'not-built') {
    return { diagnostics: [], value };
  }
  const diagnostic: Diagnostic = {
    code: 'GRAPH_QUERY_GRAPH_UNAVAILABLE',
    message: 'Graph query is unavailable because quest identities are ambiguous',
    path: ['graph'],
    severity: 'error',
  };
  return { diagnostics: addQuerySource([diagnostic], sourcePath, sourceMap), value };
}

function addQuerySource(
  diagnostics: readonly Diagnostic[],
  sourcePath: string,
  sourceMap: YamlSourceMap,
): Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    file: sourcePath,
    span: sourceMap.spanForPath(diagnostic.path),
  }));
}

function formatAnalyzeReport(report: AnalyzeReport): string {
  const lines = [
    'Quest graph analysis',
    `Source: ${report.source}`,
    `Target: ${targetLabel()}`,
    `Direction: ${report.direction}`,
    `Valid: ${report.valid ? 'yes' : 'no'}`,
    `Partial: ${report.partial ? 'yes' : 'no'}`,
  ];
  if (report.graph === null) {
    lines.push('Graph: unavailable (the source did not produce an unambiguous graph)');
  } else {
    lines.push(`Nodes: ${report.graph.nodeCount}`);
    lines.push(`Edges: ${report.graph.edgeCount}`);
    lines.push(`Roots (${report.graph.roots.length}): ${formatKeys(report.graph.roots)}`);
    lines.push(`Leaves (${report.graph.leaves.length}): ${formatKeys(report.graph.leaves)}`);
    lines.push(`Isolated (${report.graph.isolated.length}): ${formatKeys(report.graph.isolated)}`);
    lines.push(`Weak components: ${report.graph.weakComponents.length}`);
    lines.push(
      `Cycle components (${report.graph.cycleComponents.length}): ${formatComponents(report.graph.cycleComponents)}`,
    );
    lines.push(`Maximum structural depth: ${report.graph.maximumDepth ?? 'unavailable (cycle)'}`);
    lines.push(`Critical structural path: ${formatKeys(report.graph.criticalPath ?? [])}`);
  }
  if (report.query === null) {
    lines.push('Query: summary only');
  } else if ('path' in report.query) {
    lines.push(
      `Query: shortest path (${report.query.direction}) ${report.query.from} → ${report.query.to}: ${formatKeys(report.query.path ?? []) || 'none'}`,
    );
  } else {
    lines.push(
      `Query: reachable (${report.query.direction}) from ${report.query.from}${report.query.maxDepth === null ? '' : ` through depth ${report.query.maxDepth}`}: ${report.query.reachable?.length ?? 0} quests`,
    );
    if (report.query.reachable !== null) {
      lines.push(`Reachable quests: ${formatKeys(report.query.reachable.map(({ key }) => key))}`);
    }
  }
  if (report.diagnostics.length > 0) {
    lines.push(`Diagnostics: ${report.diagnostics.length}`);
  }
  return lines.join('\n');
}

function formatKeys(keys: readonly string[], limit = 20): string {
  if (keys.length === 0) {
    return 'none';
  }
  const shown = keys.slice(0, limit).join(', ');
  return keys.length > limit ? `${shown}, … (+${keys.length - limit} more)` : shown;
}

function formatComponents(components: readonly (readonly string[])[], limit = 8): string {
  if (components.length === 0) {
    return 'none';
  }
  const shown = components
    .slice(0, limit)
    .map((component) => `[${formatKeys(component, 8)}]`)
    .join(', ');
  return components.length > limit ? `${shown}, … (+${components.length - limit} more)` : shown;
}

async function loadSource(path: string): Promise<LoadedSource> {
  const result = loadQuestbook(await readFile(path, 'utf8'), path);
  return {
    diagnostics: result.diagnostics,
    graphState: result.graphState,
    questbook: result.value,
    sourceMap: result.sourceMap,
  };
}

async function loadValidatedSource(
  path: string,
  options: CommonOptions,
): Promise<Questbook | undefined> {
  const loaded = await loadSource(path);
  if (!acceptDiagnostics(loaded.diagnostics, options) || loaded.questbook === undefined) {
    return undefined;
  }
  const resourceErrors = await resourceDiagnostics(loaded, path, options);
  return acceptDiagnostics(resourceErrors, options) ? loaded.questbook : undefined;
}

async function resourceDiagnostics(
  loaded: LoadedSource,
  sourcePath: string,
  options: CommonOptions,
): Promise<Diagnostic[]> {
  if (options.resources === undefined || loaded.questbook === undefined) {
    return [];
  }
  const catalog = parseResourceCatalog(await readFile(resolve(options.resources), 'utf8'));
  return validateQuestbookResources(loaded.questbook, catalog).map((diagnostic) => ({
    ...diagnostic,
    file: sourcePath,
    span: loaded.sourceMap.spanForPath(diagnostic.path),
  }));
}

function decodeTarget(
  files: Parameters<typeof decodeFtbQuests2101>[0],
  knownIds: Parameters<typeof decodeFtbQuests2101>[1],
  options: CommonOptions,
): ReturnType<typeof decodeFtbQuests2101> | undefined {
  try {
    return decodeFtbQuests2101(files, knownIds);
  } catch (error) {
    if (!(error instanceof FtbQuestbookImportError)) {
      throw error;
    }
    const diagnostic: Diagnostic = {
      code: error.code,
      ...(error.path === undefined ? {} : { file: error.path }),
      message: error.message,
      path: error.path === undefined ? [] : [error.path],
      severity: 'error',
    };
    acceptDiagnostics([diagnostic], options);
    return undefined;
  }
}

function acceptDiagnostics(diagnostics: Diagnostic[], options: CommonOptions): boolean {
  if (diagnostics.length === 0) {
    return true;
  }
  reportDiagnostics(diagnostics, options.json ?? false);
  process.exitCode = 1;
  return false;
}

function targetLabel(): string {
  const profile = ftbQuests2101Profile;
  return `${profile.minecraft} / ${profile.loader} / ${profile.questSystem} / ${profile.serializer} / data v${profile.dataVersion}`;
}

function collectDifferences(expected: unknown, actual: unknown, path = '$'): string[] {
  if (isDeepStrictEqual(expected, actual)) {
    return [];
  }
  if (
    typeof expected !== 'object' ||
    expected === null ||
    typeof actual !== 'object' ||
    actual === null
  ) {
    return [`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
  }
  const expectedRecord = expected as Record<string, unknown>;
  const actualRecord = actual as Record<string, unknown>;
  const keys = new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)]);
  return [...keys]
    .sort(compareQuestKeys)
    .flatMap((key) => collectDifferences(expectedRecord[key], actualRecord[key], `${path}.${key}`));
}
