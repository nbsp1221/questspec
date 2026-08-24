import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { type PhysicalIdMap, allocatePhysicalIds } from './physical-id.ts';

export async function readPhysicalIdMap(path: string): Promise<PhysicalIdMap> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
  const value: unknown = JSON.parse(source);
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.values(value).some((entry) => typeof entry !== 'string')
  ) {
    throw new Error(`Invalid QuestSpec physical ID map: ${path}`);
  }
  const ids = value as PhysicalIdMap;
  allocatePhysicalIds([], ids);
  return ids;
}

export function serializePhysicalIdMap(ids: PhysicalIdMap): string {
  const sorted = Object.fromEntries(
    Object.entries(ids).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify(sorted, undefined, 2)}\n`;
}

export function defaultPhysicalIdMapPath(sourcePath: string): string {
  const filename = basename(sourcePath).replace(/\.(?:yaml|yml)$/iu, '');
  return join(dirname(sourcePath), `${filename}.ids.json`);
}
