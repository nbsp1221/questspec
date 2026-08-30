import type { PhysicalIdMap, PhysicalObjectKind } from '../../identity/physical-id.ts';
import type { Chapter, ItemStack, ItemTask } from '../../ir/questbook.ts';
import type { SnbtCompound, SnbtTag } from '../../snbt/ast.ts';
import type { DependencyRequirement, ObservationType } from '../../spec/types.ts';
import { physicalIdKey } from '../../identity/physical-id.ts';
import { parseSnbtCompound } from '../../snbt/parser.ts';
import { writeSnbt } from '../../snbt/writer.ts';
import { FtbQuestbookImportError } from './import-error.ts';

export interface LogicalIdResolver {
  get(kind: PhysicalObjectKind, physicalId: string): string | undefined;
}

export function assertOnlyFields(
  compound: SnbtCompound,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unsupported = compound.entries.find((entry) => !allowedSet.has(entry.key));
  if (unsupported !== undefined) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_FIELD',
      `Field is outside the MVP semantic subset: ${unsupported.key}`,
      `${path}.${unsupported.key}`,
    );
  }
}

export function parseFtbCompound(source: string, path: string): SnbtCompound {
  try {
    return parseSnbtCompound(source, { mode: 'ftb-compatible' });
  } catch (error) {
    throw new FtbQuestbookImportError(
      'IMPORT_INVALID_SNBT',
      `Invalid SNBT in ${path}: ${error instanceof Error ? error.message : String(error)}`,
      path,
    );
  }
}

export function parseRequired(files: ReadonlyMap<string, string>, path: string): SnbtCompound {
  const source = files.get(path);
  if (source === undefined) {
    throw new FtbQuestbookImportError(
      'IMPORT_MISSING_FILE',
      `Missing required FTB Quests file: ${path}`,
      path,
    );
  }
  return parseFtbCompound(source, path);
}

export function recordId(
  ids: PhysicalIdMap,
  kind: PhysicalObjectKind,
  key: string,
  physicalId: string,
): void {
  ids[physicalIdKey({ key, kind })] = physicalId;
}

export function logicalKey(kind: string, physicalId: string): string {
  return `${kind}_${physicalId.toLowerCase()}`;
}

export function nestedLogicalIdentity(
  kind: Extract<PhysicalObjectKind, 'quest' | 'reward' | 'task'>,
  physicalId: string,
  parent: string,
  fallback: string,
  logicalIds: LogicalIdResolver,
  path: string,
): { key: string; localKey: string } {
  const preferredKey = logicalIds.get(kind, physicalId);
  if (preferredKey === undefined) {
    return { key: `${parent}.${fallback}`, localKey: fallback };
  }
  const prefix = `${parent}.`;
  if (!preferredKey.startsWith(prefix)) {
    throw invalidField(
      path,
      `Known ${kind} ID ${physicalId} belongs to ${preferredKey}, not parent ${parent}; migrate the ID map explicitly`,
    );
  }
  return { key: preferredKey, localKey: preferredKey.slice(prefix.length) };
}

export function createLogicalIdResolver(ids: PhysicalIdMap): LogicalIdResolver {
  const byPhysicalId = new Map<string, string>();
  for (const [mapKey, physicalId] of Object.entries(ids)) {
    const separator = mapKey.indexOf(':');
    if (separator === -1) {
      continue;
    }
    const kind = mapKey.slice(0, separator);
    const key = mapKey.slice(separator + 1);
    byPhysicalId.set(`${kind}:${physicalId.toUpperCase()}`, key);
  }
  return {
    get: (kind, physicalId) => byPhysicalId.get(`${kind}:${physicalId.toUpperCase()}`),
  };
}

export function entryMap(compound: SnbtCompound): Map<string, SnbtTag> {
  return new Map(compound.entries.map((entry) => [entry.key, entry.value]));
}

export function optionalTag(compound: SnbtCompound, key: string): SnbtTag | undefined {
  return entryMap(compound).get(key);
}

export function requiredTag(compound: SnbtCompound, key: string, path: string): SnbtTag {
  const tag = optionalTag(compound, key);
  if (tag === undefined) {
    throw invalidField(`${path}.${key}`, `Missing required field ${key}`);
  }
  return tag;
}

export function requiredCompound(compound: SnbtCompound, key: string, path: string): SnbtCompound {
  return requiredCompoundTag(requiredTag(compound, key, path), `${path}.${key}`);
}

export function requiredCompoundTag(tag: SnbtTag, path: string): SnbtCompound {
  if (tag.type !== 'compound') {
    throw invalidField(path, `Expected compound, got ${tag.type}`);
  }
  return tag;
}

export function requiredList(compound: SnbtCompound, key: string, path: string) {
  return requiredListTag(requiredTag(compound, key, path), `${path}.${key}`);
}

export function optionalList(compound: SnbtCompound, key: string, path: string) {
  const tag = optionalTag(compound, key);
  return tag === undefined ? { value: [] as SnbtTag[] } : requiredListTag(tag, `${path}.${key}`);
}

export function requiredListTag(tag: SnbtTag, path: string) {
  if (tag.type !== 'list') {
    throw invalidField(path, `Expected list, got ${tag.type}`);
  }
  return tag;
}

export function requiredString(compound: SnbtCompound, key: string, path: string): string {
  const tag = requiredTag(compound, key, path);
  if (tag.type !== 'string') {
    throw invalidField(`${path}.${key}`, `Expected string, got ${tag.type}`);
  }
  return tag.value;
}

export function optionalString(compound: SnbtCompound, key: string): string | undefined {
  const tag = optionalTag(compound, key);
  if (tag === undefined) {
    return undefined;
  }
  if (tag.type !== 'string') {
    throw invalidField(key, `Expected string, got ${tag.type}`);
  }
  return tag.value;
}

export function requiredNumber(compound: SnbtCompound, key: string, path: string): number {
  return numericValue(requiredTag(compound, key, path), `${path}.${key}`);
}

export function requiredTablePhysicalId(compound: SnbtCompound, key: string, path: string): string {
  const tag = requiredTag(compound, key, path);
  if (tag.type !== 'long' || tag.value <= 0n) {
    throw invalidField(`${path}.${key}`, 'Expected a positive signed-long reward-table ID');
  }
  return tag.value.toString(16).toUpperCase().padStart(16, '0');
}

export function decodeMinWidth(compound: SnbtCompound, path: string): number {
  const tag = optionalTag(compound, 'min_width');
  if (tag === undefined) {
    return 0;
  }
  const fieldPath = `${path}.min_width`;
  if (tag.type !== 'int') {
    throw invalidField(fieldPath, `Expected int, got ${tag.type}`);
  }
  if (tag.value < 0 || tag.value > 3000) {
    throw invalidField(
      fieldPath,
      `Persisted min_width ${tag.value} is outside the QuestSpec target policy 0..3000`,
    );
  }
  return tag.value;
}

export function optionalNumber(compound: SnbtCompound, key: string): number | undefined {
  const tag = optionalTag(compound, key);
  return tag === undefined ? undefined : numericValue(tag, key);
}

export function numericValue(tag: SnbtTag, path: string): number {
  if (['byte', 'short', 'int', 'float', 'double'].includes(tag.type)) {
    return (tag as Extract<SnbtTag, { value: number }>).value;
  }
  if (tag.type === 'long') {
    const value = Number(tag.value);
    if (!Number.isSafeInteger(value)) {
      throw invalidField(path, 'Long value is outside the safe integer range');
    }
    return value;
  }
  throw invalidField(path, `Expected numeric tag, got ${tag.type}`);
}

export function optionalBoolean(compound: SnbtCompound, key: string): boolean | undefined {
  const tag = optionalTag(compound, key);
  if (tag === undefined) {
    return undefined;
  }
  if (tag.type !== 'byte' || (tag.value !== 0 && tag.value !== 1)) {
    throw invalidField(key, `Expected boolean byte, got ${tag.type}`);
  }
  return tag.value === 1;
}

export function optionalStringList(compound: SnbtCompound, key: string, path: string): string[] {
  return optionalList(compound, key, path).value.map((tag, index) => {
    if (tag.type !== 'string') {
      throw invalidField(`${path}.${key}[${index}]`, `Expected string, got ${tag.type}`);
    }
    return tag.value;
  });
}

export function decodeItemStack(compound: SnbtCompound, path: string): ItemStack {
  assertOnlyFields(compound, ['components', 'count', 'id'], path);
  const count = optionalTag(compound, 'count');
  if (count !== undefined && (count.type !== 'int' || count.value !== 1)) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_FIELD',
      'Nested item-stack count must be the canonical int value 1',
      `${path}.count`,
    );
  }
  const components = optionalTag(compound, 'components');
  return {
    components:
      components === undefined
        ? {}
        : Object.fromEntries(
            requiredCompoundTag(components, `${path}.components`).entries.map((entry) => [
              entry.key,
              writeSnbt(entry.value).trimEnd(),
            ]),
          ),
    id: requiredString(compound, 'id', path),
  };
}

export function decodeObjectCommon(
  compound: SnbtCompound,
  path: string,
): { icon?: ItemStack; tags: string[] } {
  const icon = optionalTag(compound, 'icon');
  return {
    ...(icon === undefined
      ? {}
      : { icon: decodeItemStack(requiredCompoundTag(icon, `${path}.icon`), `${path}.icon`) }),
    tags: optionalStringList(compound, 'tags', path),
  };
}

export function decodeDependencyRequirement(
  compound: SnbtCompound,
  path: string,
): DependencyRequirement {
  const tag = optionalTag(compound, 'dependency_requirement');
  if (tag === undefined) {
    return 'all_completed';
  }
  const fieldPath = `${path}.dependency_requirement`;
  if (tag.type !== 'string') {
    throw invalidField(fieldPath, `Expected string, got ${tag.type}`);
  }
  const requirement = tag.value;
  if (
    requirement !== 'all_completed' &&
    requirement !== 'one_completed' &&
    requirement !== 'all_started' &&
    requirement !== 'one_started'
  ) {
    throw invalidField(fieldPath, `Unsupported dependency requirement ${requirement}`);
  }
  return requirement;
}

export function decodeProgressionMode(
  value: string | undefined,
  path: string,
): Chapter['progressionMode'] {
  const mode = value ?? 'default';
  if (mode !== 'default' && mode !== 'flexible' && mode !== 'linear') {
    throw invalidField(`${path}.progression_mode`, `Unsupported progression mode ${mode}`);
  }
  return mode;
}

export function decodeMatchComponents(
  value: string | undefined,
  path: string,
): ItemTask['matchComponents'] {
  const mode = value ?? 'none';
  if (mode !== 'none' && mode !== 'fuzzy' && mode !== 'strict') {
    throw invalidField(`${path}.match_components`, `Unsupported component match mode ${mode}`);
  }
  return mode;
}

function invalidField(path: string, message: string): FtbQuestbookImportError {
  return new FtbQuestbookImportError('IMPORT_INVALID_FIELD', message, path);
}

const observationTypes = [
  'block',
  'block_tag',
  'block_state',
  'block_entity',
  'block_entity_type',
  'entity_type',
  'entity_type_tag',
] as const satisfies readonly ObservationType[];

export function decodeObservationType(
  named: string | undefined,
  ordinal: number | undefined,
  path: string,
): ObservationType {
  const fromName = observationTypes.find((value) => value === named);
  if (named !== undefined && fromName === undefined) {
    throw invalidField(`${path}.observation_type`, `Unsupported observation type ${named}`);
  }
  const fromOrdinal = ordinal === undefined ? undefined : observationTypes[ordinal];
  if (ordinal !== undefined && fromOrdinal === undefined) {
    throw invalidField(`${path}.observe_type`, `Unsupported observation ordinal ${ordinal}`);
  }
  if (fromName !== undefined && fromOrdinal !== undefined && fromName !== fromOrdinal) {
    throw invalidField(
      `${path}.observation_type`,
      `Observation type ${fromName} conflicts with legacy ordinal ${ordinal}`,
    );
  }
  const value = fromName ?? fromOrdinal;
  if (value === undefined) {
    throw invalidField(path, 'Observation task requires observation_type or observe_type');
  }
  return value;
}

export function decodeAutoClaim(value: string, path: string): 'disabled' | 'enabled' {
  if (value !== 'disabled' && value !== 'enabled') {
    throw invalidField(path, `Unsupported default auto-claim value ${value}`);
  }
  return value;
}

export function rejectNonEmptyCollection(compound: SnbtCompound, key: string, path: string): void {
  const tag = optionalTag(compound, key);
  if (tag !== undefined && requiredListTag(tag, `${path}.${key}`).value.length > 0) {
    throw new FtbQuestbookImportError(
      'IMPORT_UNSUPPORTED_TYPE',
      `Non-empty ${key} is outside the MVP semantic subset`,
      `${path}.${key}`,
    );
  }
}
