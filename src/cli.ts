import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { type CAC, cac } from 'cac';
import pkg from '../package.json' with { type: 'json' };
import type { Diagnostic } from './diagnostics/diagnostic.ts';
import type { Questbook } from './ir/questbook.ts';
import { reportDiagnostics } from './diagnostics/reporter.ts';
import { writeDirectoryAtomic, writeFileSetAtomic } from './filesystem/atomic-output.ts';
import { readSnbtDirectory } from './filesystem/read-directory.ts';
import {
  defaultPhysicalIdMapPath,
  readPhysicalIdMap,
  serializePhysicalIdMap,
} from './identity/id-map.ts';
import { loadQuestbook } from './spec/load.ts';
import { serializeQuestbook } from './spec/serialize.ts';
import { decodeFtbQuests2101 } from './targets/ftbquests-2101.1.33/decode.ts';
import {
  FtbQuestbookCompilationError,
  compileFtbQuests2101,
} from './targets/ftbquests-2101.1.33/encode.ts';
import { ftbQuests2101Profile } from './targets/ftbquests-2101.1.33/profile.ts';

interface CommonOptions {
  json?: boolean;
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

export function createCli(): CAC {
  const cli = cac('questspec');

  cli
    .command('validate <source>', 'Validate a declarative QuestSpec YAML file')
    .option('--json', 'Write diagnostics as JSON')
    .action(async (source: string, options: CommonOptions) => {
      const loaded = await loadSource(resolve(source));
      if (!acceptDiagnostics(loaded.diagnostics, options)) {
        return;
      }
      console.log(`Valid: ${resolve(source)}`);
      console.log(`Target: ${targetLabel()}`);
    });

  cli
    .command('compile <source>', 'Compile QuestSpec YAML into an FTB Quests directory')
    .option('-o, --output <directory>', 'Generated FTB Quests directory')
    .option('--id-map <file>', 'Physical ID map (defaults beside the source)')
    .option('--force', 'Replace an existing output directory')
    .option('--json', 'Write diagnostics as JSON')
    .action(async (source: string, options: CompileOptions) => {
      if (options.output === undefined) {
        throw new Error('questspec compile: --output is required');
      }
      const sourcePath = resolve(source);
      const loaded = await loadSource(sourcePath);
      if (!acceptDiagnostics(loaded.diagnostics, options) || loaded.questbook === undefined) {
        return;
      }
      const idMapPath = resolve(options.idMap ?? defaultPhysicalIdMapPath(sourcePath));
      const importedIds = await readPhysicalIdMap(idMapPath);
      let compiled;
      try {
        compiled = compileFtbQuests2101(loaded.questbook, importedIds);
      } catch (error) {
        if (error instanceof FtbQuestbookCompilationError && error.diagnostics.length > 0) {
          acceptDiagnostics(error.diagnostics, options);
          return;
        }
        throw error;
      }
      const output = resolve(options.output);
      await writeDirectoryAtomic(compiled.files, output, { overwrite: options.force });
      console.log(`Compiled ${compiled.files.size} files to ${output}`);
      console.log(`Target: ${targetLabel()}`);
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
      const knownIds = await readPhysicalIdMap(idMapPath);
      const imported = decodeFtbQuests2101(await readSnbtDirectory(resolve(directory)), knownIds);
      await writeFileSetAtomic(
        new Map([
          [output, serializeQuestbook(imported.questbook)],
          [idMapPath, serializePhysicalIdMap(imported.ids)],
        ]),
        { overwrite: options.force },
      );
      console.log(`Imported ${resolve(directory)} to ${output}`);
      console.log(`ID map: ${idMapPath}`);
      console.log(`Target: ${targetLabel()}`);
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
      const expected = decodeFtbQuests2101(expectedCompiled.files, expectedCompiled.ids).questbook;
      const actual = decodeFtbQuests2101(
        await readSnbtDirectory(resolve(directory)),
        expectedCompiled.ids,
      ).questbook;
      const differences = collectDifferences(expected, actual);
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

async function loadSource(
  path: string,
): Promise<{ diagnostics: Diagnostic[]; questbook?: Questbook }> {
  const result = loadQuestbook(await readFile(path, 'utf8'), path);
  return { diagnostics: result.diagnostics, questbook: result.value };
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
    .sort((left, right) => left.localeCompare(right))
    .flatMap((key) => collectDifferences(expectedRecord[key], actualRecord[key], `${path}.${key}`));
}
