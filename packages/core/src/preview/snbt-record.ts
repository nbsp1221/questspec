import type { SnbtCompound, SnbtTag } from '../snbt/index.ts';
import { parseSnbtCompound } from '../snbt/index.ts';
import type { PreviewDiagnostic } from './types.ts';

export type RecordValue = Record<string, unknown>;

export function parseFile(
  path: string,
  source: string,
  diagnostics: PreviewDiagnostic[],
): RecordValue | undefined {
  try {
    return compoundToRecord(parseSnbtCompound(source, { mode: 'ftb-compatible' }));
  } catch (error) {
    diagnostics.push({
      file: path,
      message: error instanceof Error ? error.message : String(error),
      severity: 'error',
    });
    return undefined;
  }
}

function compoundToRecord(compound: SnbtCompound): RecordValue {
  return Object.fromEntries(compound.entries.map(({ key, value }) => [key, tagValue(value)]));
}

function tagValue(tag: SnbtTag): unknown {
  switch (tag.type) {
    case 'compound':
      return compoundToRecord(tag);
    case 'list':
      return tag.value.map(tagValue);
    case 'long':
      return Number(tag.value);
    case 'byte-array':
    case 'int-array':
      return [...tag.value];
    case 'long-array':
      return tag.value.map(Number);
    case 'end':
      return undefined;
    case 'byte':
    case 'double':
    case 'float':
    case 'int':
    case 'short':
    case 'string':
      return tag.value;
  }
}

export function record(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function boolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 0 || value === 1) {
    return value === 1;
  }
  return undefined;
}

export function stringList(value: unknown): string[] {
  return list(value).filter((candidate): candidate is string => typeof candidate === 'string');
}

export function itemId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return text(record(value)?.id);
}
