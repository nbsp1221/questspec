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

function formatNumber(value: number, explicitDecimal = false): string {
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
    return explicitDecimal ? '-0.0' : '-0';
  }
  return explicitDecimal && Number.isInteger(value) ? `${value}.0` : String(value);
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
    ? [...tag.entries].sort((left, right) =>
        left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
      )
    : tag.entries;
  const indentation = context.indent.repeat(depth + 1);
  const closingIndentation = context.indent.repeat(depth);
  const lines = entries.map((entry) => {
    const key = simpleString.test(entry.key) ? entry.key : quote(entry.key);
    return `${indentation}${key}: ${writeTag(entry.value, depth + 1, context)}`;
  });
  return `{\n${lines.join('\n')}\n${closingIndentation}}`;
}

function writeList(
  tag: SnbtTag & { type: 'list' },
  depth: number,
  context: Required<WriteSnbtOptions>,
) {
  if (tag.value.length === 0) {
    return '[ ]';
  }
  if (tag.value.length === 1) {
    return `[${writeTag(tag.value[0], depth, context)}]`;
  }
  const indentation = context.indent.repeat(depth + 1);
  const closingIndentation = context.indent.repeat(depth);
  const lines = tag.value.map((value) => `${indentation}${writeTag(value, depth + 1, context)}`);
  return `[\n${lines.join('\n')}\n${closingIndentation}]`;
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
      return `${formatNumber(tag.value, true)}d`;
    case 'end':
      return 'null';
    case 'float':
      return `${formatNumber(tag.value, true)}f`;
    case 'int':
      return String(tag.value);
    case 'int-array':
      return writeArray('I', tag.value, '');
    case 'list':
      return writeList(tag, depth, context);
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
