import type { SnbtCompoundEntry, SnbtTag } from './ast.ts';

export function snbtSemanticallyEqual(left: SnbtTag, right: SnbtTag): boolean {
  if (left.type !== right.type) {
    return false;
  }

  switch (left.type) {
    case 'compound': {
      if (right.type !== 'compound' || left.entries.length !== right.entries.length) {
        return false;
      }
      const rightEntries = new Map(right.entries.map((entry) => [entry.key, entry]));
      return left.entries.every((entry) => {
        const other = rightEntries.get(entry.key);
        return other !== undefined && equalEntry(entry, other);
      });
    }
    case 'list':
      return (
        right.type === 'list' &&
        left.elementType === right.elementType &&
        equalTagArrays(left.value, right.value)
      );
    case 'byte-array':
    case 'int-array':
      return right.type === left.type && equalNumberArrays(left.value, right.value);
    case 'long-array':
      return (
        right.type === 'long-array' &&
        left.value.length === right.value.length &&
        left.value.every((value, index) => value === right.value[index])
      );
    case 'end':
      return right.type === 'end';
    case 'byte':
    case 'double':
    case 'float':
    case 'int':
    case 'short':
      return right.type === left.type && numbersEqual(left.value, right.value);
    case 'long':
    case 'string':
      return right.type === left.type && left.value === right.value;
  }
}

function equalEntry(left: SnbtCompoundEntry, right: SnbtCompoundEntry): boolean {
  return left.key === right.key && snbtSemanticallyEqual(left.value, right.value);
}

function equalNumberArrays(left: number[], right: number[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => numbersEqual(value, right[index]))
  );
}

function equalTagArrays(left: SnbtTag[], right: SnbtTag[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => snbtSemanticallyEqual(value, right[index]))
  );
}

function numbersEqual(left: number, right: number): boolean {
  return Object.is(left, right) || (Number.isNaN(left) && Number.isNaN(right));
}
