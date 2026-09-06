import type {
  SnbtCompound,
  SnbtCompoundEntry,
  SnbtDouble,
  SnbtFloat,
  SnbtInt,
  SnbtList,
  SnbtPosition,
  SnbtScalar,
  SnbtSpan,
  SnbtTag,
} from './ast.ts';
import { SnbtParseError } from './error.ts';
import { SnbtLexer, type SnbtToken, type SnbtTokenType } from './lexer.ts';

const integerPattern = /^[+-]?\d+$/u;
const decimalPattern = /^[+-]?(?:(?:\d+\.\d*|\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)$/u;
const intMinimum = -2_147_483_648;
const intMaximum = 2_147_483_647;
const longMinimum = -(1n << 63n);
const longMaximum = (1n << 63n) - 1n;

export interface ParseSnbtOptions {
  mode?: 'ftb-compatible' | 'strict';
}

export function parseSnbt(source: string, options: ParseSnbtOptions = {}): SnbtTag {
  return new Parser(source, options).parse();
}

export function parseSnbtCompound(source: string, options: ParseSnbtOptions = {}): SnbtCompound {
  const tag = parseSnbt(source, options);
  if (tag.type !== 'compound') {
    throw new SnbtParseError('SNBT_EXPECTED_TOKEN', 'Expected a compound root', tag.span);
  }
  return tag;
}

class Parser {
  private readonly bufferedTokens: SnbtToken[] = [];
  private readonly lexer: SnbtLexer;
  private readonly mode: NonNullable<ParseSnbtOptions['mode']>;

  constructor(source: string, options: ParseSnbtOptions) {
    this.mode = options.mode ?? 'strict';
    this.lexer = new SnbtLexer(source, {
      discardUnknownEscapes: this.mode === 'ftb-compatible',
    });
  }

  parse(): SnbtTag {
    const tag = this.readTag();
    const trailing = this.peek();
    if (trailing.type !== 'eof') {
      throw new SnbtParseError(
        'SNBT_TRAILING_INPUT',
        'Unexpected input after the root tag',
        trailing.span,
      );
    }
    return tag;
  }

  private consume(type?: SnbtTokenType): SnbtToken {
    const token = this.bufferedTokens.shift() ?? this.lexer.next();
    if (type !== undefined && token.type !== type) {
      throw this.expected(type, token);
    }
    return token;
  }

  private expected(expected: string, actual: SnbtToken): SnbtParseError {
    return new SnbtParseError(
      'SNBT_EXPECTED_TOKEN',
      `Expected ${expected}, got ${actual.type}`,
      actual.span,
    );
  }

  private peek(distance = 0): SnbtToken {
    while (this.bufferedTokens.length <= distance) {
      this.bufferedTokens.push(this.lexer.next());
    }
    return this.bufferedTokens[distance];
  }

  private readArray(kind: 'B' | 'I' | 'L', start: SnbtPosition): SnbtTag {
    this.consume('atom');
    this.consume('semicolon');
    const values: Array<bigint | number> = [];

    while (this.peek().type !== 'right-bracket') {
      if (this.peek().type === 'comma') {
        this.consume();
        continue;
      }
      const value = this.readTag();
      if (!isNumeric(value)) {
        throw new SnbtParseError(
          'SNBT_INVALID_ARRAY_VALUE',
          `Expected a numeric value in ${kind.toUpperCase()} array`,
          value.span,
        );
      }
      values.push(coerceArrayValue(value, kind));
    }

    const end = this.consume('right-bracket').span.end;
    const span = { end, start };
    if (kind === 'B') {
      return { span, type: 'byte-array', value: values as number[] };
    }
    if (kind === 'I') {
      return { span, type: 'int-array', value: values as number[] };
    }
    return { span, type: 'long-array', value: values as bigint[] };
  }

  private readCollection(): SnbtTag {
    const opening = this.consume('left-bracket');
    const marker = this.peek();
    const markerValue = marker.type === 'atom' ? marker.value?.toUpperCase() : undefined;
    if (
      (markerValue === 'B' || markerValue === 'I' || markerValue === 'L') &&
      this.peek(1).type === 'semicolon'
    ) {
      return this.readArray(markerValue, opening.span.start);
    }

    const value: SnbtTag[] = [];
    let elementType: SnbtList['elementType'] = null;
    while (this.peek().type !== 'right-bracket') {
      if (this.peek().type === 'comma') {
        this.consume();
        continue;
      }
      const element = this.readTag();
      if (elementType === null) {
        elementType = element.type;
      }
      if (element.type !== elementType) {
        throw new SnbtParseError(
          'SNBT_HETEROGENEOUS_LIST',
          `List element has type ${element.type}; expected ${elementType}`,
          element.span,
        );
      }
      value.push(element);
    }

    return {
      elementType,
      span: { end: this.consume('right-bracket').span.end, start: opening.span.start },
      type: 'list',
      value,
    };
  }

  private readCompound(): SnbtCompound {
    const opening = this.consume('left-brace');
    const entries: SnbtCompoundEntry[] = [];

    while (this.peek().type !== 'right-brace') {
      if (this.peek().type === 'comma') {
        this.consume();
        continue;
      }

      const keyToken = this.consume();
      if (keyToken.type !== 'atom' && keyToken.type !== 'string') {
        throw this.expected('compound key', keyToken);
      }
      const key = keyToken.value!;
      const duplicateIndex = entries.findIndex((entry) => entry.key === key);
      if (duplicateIndex !== -1 && this.mode === 'strict') {
        throw new SnbtParseError(
          'SNBT_DUPLICATE_KEY',
          `Duplicate compound key ${JSON.stringify(key)}`,
          keyToken.span,
        );
      }
      const separator = this.consume();
      if (separator.type !== 'colon' && separator.type !== 'equals') {
        throw this.expected(': or =', separator);
      }
      const entry = { key, keySpan: keyToken.span, value: this.readTag() };
      if (duplicateIndex === -1) {
        entries.push(entry);
      } else {
        entries[duplicateIndex] = entry;
      }
    }

    return {
      entries,
      span: { end: this.consume('right-brace').span.end, start: opening.span.start },
      type: 'compound',
    };
  }

  private readTag(): SnbtTag {
    const token = this.peek();
    if (token.type === 'left-brace') {
      return this.readCompound();
    }
    if (token.type === 'left-bracket') {
      return this.readCollection();
    }
    this.consume();
    if (token.type === 'string') {
      return { span: token.span, type: 'string', value: token.value! };
    }
    if (token.type === 'atom') {
      return parseScalar(token.value!, token.span);
    }
    throw this.expected('tag', token);
  }
}

function coerceArrayValue(value: Exclude<SnbtScalar, { type: 'end' | 'string' }>, kind: string) {
  const numeric = value.type === 'long' ? value.value : BigInt(Math.trunc(value.value));
  if (kind === 'L') {
    return BigInt.asIntN(64, numeric);
  }
  if (kind === 'I') {
    return Number(BigInt.asIntN(32, numeric));
  }
  return Number(BigInt.asIntN(8, numeric));
}

function isNumeric(value: SnbtTag): value is Exclude<SnbtScalar, { type: 'end' | 'string' }> {
  return ['byte', 'double', 'float', 'int', 'long', 'short'].includes(value.type);
}

function numberInRange(value: string, minimum: number, maximum: number): number | undefined {
  if (!integerPattern.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

function numericError(value: string, span: SnbtSpan): never {
  throw new SnbtParseError('SNBT_INVALID_NUMBER', `Numeric value is out of range: ${value}`, span);
}

function parseScalar(value: string, span: SnbtSpan): SnbtScalar {
  if (value === 'true' || value === 'false') {
    return { presentation: 'boolean', span, type: 'byte', value: value === 'true' ? 1 : 0 };
  }
  if (value === 'null' || value === 'end' || value === 'END') {
    return { span, type: 'end' };
  }

  const special = parseSpecialFloat(value, span);
  if (special) {
    return special;
  }

  const suffix = value.at(-1)?.toLowerCase();
  const body = value.slice(0, -1);
  if (suffix === 'b' && integerPattern.test(body)) {
    const parsed = numberInRange(body, -128, 127);
    return parsed === undefined ? numericError(value, span) : { span, type: 'byte', value: parsed };
  }
  if (suffix === 's' && integerPattern.test(body)) {
    const parsed = numberInRange(body, -32_768, 32_767);
    return parsed === undefined
      ? numericError(value, span)
      : { span, type: 'short', value: parsed };
  }
  if (suffix === 'l' && integerPattern.test(body)) {
    const parsed = BigInt(body);
    if (parsed < longMinimum || parsed > longMaximum) {
      numericError(value, span);
    }
    return { span, type: 'long', value: parsed };
  }
  if ((suffix === 'f' || suffix === 'd') && decimalPattern.test(body)) {
    const parsed = Number(body);
    if (Number.isNaN(parsed)) {
      numericError(value, span);
    }
    return suffix === 'f'
      ? ({ span, type: 'float', value: Math.fround(parsed) } satisfies SnbtFloat)
      : ({ span, type: 'double', value: parsed } satisfies SnbtDouble);
  }
  if (integerPattern.test(value)) {
    const parsed = numberInRange(value, intMinimum, intMaximum);
    if (parsed !== undefined) {
      return { span, type: 'int', value: parsed } satisfies SnbtInt;
    }
    return { span, type: 'string', value };
  }
  if (decimalPattern.test(value)) {
    return { span, type: 'double', value: Number(value) } satisfies SnbtDouble;
  }
  return { span, type: 'string', value };
}

function parseSpecialFloat(value: string, span: SnbtSpan): SnbtDouble | SnbtFloat | undefined {
  const doubleValues: Readonly<Record<string, number>> = {
    '+Infinity': Number.POSITIVE_INFINITY,
    '+Infinityd': Number.POSITIVE_INFINITY,
    '+∞': Number.POSITIVE_INFINITY,
    '+∞d': Number.POSITIVE_INFINITY,
    '-Infinity': Number.NEGATIVE_INFINITY,
    '-Infinityd': Number.NEGATIVE_INFINITY,
    '-∞': Number.NEGATIVE_INFINITY,
    '-∞d': Number.NEGATIVE_INFINITY,
    'Infinity': Number.POSITIVE_INFINITY,
    'Infinityd': Number.POSITIVE_INFINITY,
    'NaN': Number.NaN,
    'NaNd': Number.NaN,
    '∞': Number.POSITIVE_INFINITY,
    '∞d': Number.POSITIVE_INFINITY,
  };
  if (Object.hasOwn(doubleValues, value)) {
    return { span, type: 'double', value: doubleValues[value] };
  }

  const floatValues: Readonly<Record<string, number>> = {
    '+Infinityf': Number.POSITIVE_INFINITY,
    '+∞f': Number.POSITIVE_INFINITY,
    '-Infinityf': Number.NEGATIVE_INFINITY,
    '-∞f': Number.NEGATIVE_INFINITY,
    'Infinityf': Number.POSITIVE_INFINITY,
    'NaNf': Number.NaN,
    '∞f': Number.POSITIVE_INFINITY,
  };
  if (Object.hasOwn(floatValues, value)) {
    return { span, type: 'float', value: floatValues[value] };
  }
  return undefined;
}
