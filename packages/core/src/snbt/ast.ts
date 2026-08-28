export interface SnbtPosition {
  column: number;
  line: number;
  offset: number;
}

export interface SnbtSpan {
  end: SnbtPosition;
  start: SnbtPosition;
}

interface SnbtNodeBase {
  span: SnbtSpan;
}

export interface SnbtByte extends SnbtNodeBase {
  presentation?: 'boolean';
  type: 'byte';
  value: number;
}

export interface SnbtShort extends SnbtNodeBase {
  type: 'short';
  value: number;
}

export interface SnbtInt extends SnbtNodeBase {
  type: 'int';
  value: number;
}

export interface SnbtLong extends SnbtNodeBase {
  type: 'long';
  value: bigint;
}

export interface SnbtFloat extends SnbtNodeBase {
  type: 'float';
  value: number;
}

export interface SnbtDouble extends SnbtNodeBase {
  type: 'double';
  value: number;
}

export interface SnbtString extends SnbtNodeBase {
  type: 'string';
  value: string;
}

export interface SnbtEnd extends SnbtNodeBase {
  type: 'end';
}

export type SnbtScalar =
  | SnbtByte
  | SnbtDouble
  | SnbtEnd
  | SnbtFloat
  | SnbtInt
  | SnbtLong
  | SnbtShort
  | SnbtString;

export type SnbtTagType = SnbtTag['type'];

export interface SnbtList extends SnbtNodeBase {
  elementType: SnbtTagType | null;
  type: 'list';
  value: SnbtTag[];
}

export interface SnbtByteArray extends SnbtNodeBase {
  type: 'byte-array';
  value: number[];
}

export interface SnbtIntArray extends SnbtNodeBase {
  type: 'int-array';
  value: number[];
}

export interface SnbtLongArray extends SnbtNodeBase {
  type: 'long-array';
  value: bigint[];
}

export interface SnbtCompoundEntry {
  key: string;
  keySpan: SnbtSpan;
  value: SnbtTag;
}

export interface SnbtCompound extends SnbtNodeBase {
  entries: SnbtCompoundEntry[];
  type: 'compound';
}

export type SnbtTag =
  | SnbtByte
  | SnbtByteArray
  | SnbtCompound
  | SnbtDouble
  | SnbtEnd
  | SnbtFloat
  | SnbtInt
  | SnbtIntArray
  | SnbtList
  | SnbtLong
  | SnbtLongArray
  | SnbtShort
  | SnbtString;

export function syntheticSpan(): SnbtSpan {
  const position = { column: 1, line: 1, offset: 0 };
  return { end: { ...position }, start: { ...position } };
}
