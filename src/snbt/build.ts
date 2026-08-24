import type {
  SnbtByte,
  SnbtCompound,
  SnbtDouble,
  SnbtInt,
  SnbtList,
  SnbtLong,
  SnbtString,
  SnbtTag,
} from './ast.ts';
import { syntheticSpan } from './ast.ts';

export function snbtBoolean(value: boolean): SnbtByte {
  return { presentation: 'boolean', span: syntheticSpan(), type: 'byte', value: value ? 1 : 0 };
}

export function snbtCompound(entries: Array<[string, SnbtTag]>): SnbtCompound {
  return {
    entries: entries.map(([key, value]) => ({ key, keySpan: syntheticSpan(), value })),
    span: syntheticSpan(),
    type: 'compound',
  };
}

export function snbtDouble(value: number): SnbtDouble {
  return { span: syntheticSpan(), type: 'double', value };
}

export function snbtInt(value: number): SnbtInt {
  return { span: syntheticSpan(), type: 'int', value };
}

export function snbtList(value: SnbtTag[]): SnbtList {
  const elementType = value[0]?.type ?? null;
  if (value.some((element) => element.type !== elementType)) {
    throw new TypeError('Constructed SNBT lists must be homogeneous');
  }
  return { elementType, span: syntheticSpan(), type: 'list', value };
}

export function snbtLong(value: bigint | number): SnbtLong {
  return { span: syntheticSpan(), type: 'long', value: BigInt(value) };
}

export function snbtString(value: string): SnbtString {
  return { span: syntheticSpan(), type: 'string', value };
}

export function snbtStringList(values: string[]): SnbtList {
  return snbtList(values.map(snbtString));
}
