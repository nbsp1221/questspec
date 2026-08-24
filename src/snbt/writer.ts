import type { SnbtCompound, SnbtTag } from './ast.ts';

export interface WriteSnbtOptions {
  indent?: string;
  sortKeys?: boolean;
}

const simpleString = /^[\p{L}\p{N}._+\-∞]+$/u;

export function writeSnbt(tag: SnbtTag, options: WriteSnbtOptions = {}): string {
  const context = {
    indent: options.indent ?? '\t',
    sortKeys: options.sortKeys ?? true,
  };
  return `${writeTag(tag, 0, context)}\n`;
}

function formatNumber(value: number): string {
  if (Number.isNaN(value)) {
    return 'NaN';
  }
  if (value === Number.POSITIVE_INFINITY) {
    return 'Infinity';
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return '-Infinity';
  }
  if (Object.is(value, -0)) {
    return '-0';
  }
  return String(value);
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function writeArray(
  marker: 'B' | 'I' | 'L',
  values: Array<bigint | number>,
  suffix: '' | 'L' | 'b',
): string {
  if (values.length === 0) {
    return `[${marker}; ]`;
  }
  return `[${marker};${values.map((value) => `${String(value)}${suffix}`).join(',')}]`;
}

function writeCompound(
  tag: SnbtCompound,
  depth: number,
  context: Required<WriteSnbtOptions>,
): string {
  if (tag.entries.length === 0) {
    return '{ }';
  }
  const entries = context.sortKeys
    ? [...tag.entries].sort((left, right) => left.key.localeCompare(right.key, 'en'))
    : tag.entries;
  const indentation = context.indent.repeat(depth + 1);
  const closingIndentation = context.indent.repeat(depth);
  const lines = entries.map((entry) => {
    const key = simpleString.test(entry.key) ? entry.key : quote(entry.key);
    return `${indentation}${key}: ${writeTag(entry.value, depth + 1, context)}`;
  });
  return `{\n${lines.join('\n')}\n${closingIndentation}}`;
}

function writeTag(tag: SnbtTag, depth: number, context: Required<WriteSnbtOptions>): string {
  switch (tag.type) {
    case 'byte':
      return tag.presentation === 'boolean'
        ? tag.value === 0
          ? 'false'
          : 'true'
        : `${tag.value}b`;
    case 'byte-array':
      return writeArray('B', tag.value, 'b');
    case 'compound':
      return writeCompound(tag, depth, context);
    case 'double':
      return `${formatNumber(tag.value)}d`;
    case 'end':
      return 'null';
    case 'float':
      return `${formatNumber(tag.value)}f`;
    case 'int':
      return String(tag.value);
    case 'int-array':
      return writeArray('I', tag.value, '');
    case 'list':
      return tag.value.length === 0
        ? '[ ]'
        : `[${tag.value.map((value) => writeTag(value, depth, context)).join(',')}]`;
    case 'long':
      return `${tag.value}L`;
    case 'long-array':
      return writeArray('L', tag.value, 'L');
    case 'short':
      return `${tag.value}s`;
    case 'string':
      return quote(tag.value);
  }
}
