import { describe, expect, it } from 'vitest';
import type { SnbtParseError } from '../../src/snbt/error.ts';
import { parseSnbt } from '../../src/snbt/parser.ts';

describe('parseSnbt', () => {
  it('parses FTB compounds without commas and retains source spans', () => {
    const source = '{\n  enabled: true\n  count: 3\n}';

    expect(parseSnbt(source)).toEqual({
      entries: [
        {
          key: 'enabled',
          keySpan: {
            end: { column: 10, line: 2, offset: 11 },
            start: { column: 3, line: 2, offset: 4 },
          },
          value: {
            presentation: 'boolean',
            span: {
              end: { column: 16, line: 2, offset: 17 },
              start: { column: 12, line: 2, offset: 13 },
            },
            type: 'byte',
            value: 1,
          },
        },
        {
          key: 'count',
          keySpan: {
            end: { column: 8, line: 3, offset: 25 },
            start: { column: 3, line: 3, offset: 20 },
          },
          value: {
            span: {
              end: { column: 11, line: 3, offset: 28 },
              start: { column: 10, line: 3, offset: 27 },
            },
            type: 'int',
            value: 3,
          },
        },
      ],
      span: {
        end: { column: 2, line: 4, offset: 30 },
        start: { column: 1, line: 1, offset: 0 },
      },
      type: 'compound',
    });
  });

  it('accepts equals separators and whole-line comments', () => {
    const tag = parseSnbt('# generated\n{ value = false }');

    expect(tag.type).toBe('compound');
    expect(tag.type === 'compound' && tag.entries[0]?.value).toMatchObject({
      presentation: 'boolean',
      type: 'byte',
      value: 0,
    });
  });

  it('preserves every scalar and typed-array category', () => {
    const tag = parseSnbt(`{
      byte: -1b
      short: 2s
      int: 3
      long: 4L
      float: 5.5f
      double: 6.5d
      string: 'quoted text'
      bytes: [B; -1b, 2b]
      ints: [I; 3, 4s]
      longs: [L; 5L, 6]
      empty: null
    }`);

    expect(tag.type).toBe('compound');
    if (tag.type !== 'compound') {
      return;
    }
    expect(tag.entries.map(({ value }) => value.type)).toEqual([
      'byte',
      'short',
      'int',
      'long',
      'float',
      'double',
      'string',
      'byte-array',
      'int-array',
      'long-array',
      'end',
    ]);
    expect(tag.entries[7]?.value).toMatchObject({ type: 'byte-array', value: [-1, 2] });
    expect(tag.entries[8]?.value).toMatchObject({ type: 'int-array', value: [3, 4] });
    expect(tag.entries[9]?.value).toMatchObject({ type: 'long-array', value: [5n, 6n] });
  });

  it('rejects duplicate keys with a stable diagnostic', () => {
    expect(() => parseSnbt('{ value: 1 value: 2 }')).toThrowError(
      expect.objectContaining<Partial<SnbtParseError>>({ code: 'SNBT_DUPLICATE_KEY' }),
    );
  });

  it('uses the last duplicate value in FTB compatibility mode', () => {
    const tag = parseSnbt('{ value: 1 value: 2 }', { mode: 'ftb-compatible' });

    expect(tag.type === 'compound' && tag.entries).toHaveLength(1);
    expect(tag.type === 'compound' && tag.entries[0]?.value).toMatchObject({
      type: 'int',
      value: 2,
    });
  });

  it('matches FTB Library handling of unsupported escapes in compatibility mode', () => {
    const tag = parseSnbt('{ text: "before\\&after" }', { mode: 'ftb-compatible' });

    expect(tag.type === 'compound' && tag.entries[0]?.value).toMatchObject({
      type: 'string',
      value: 'beforeafter',
    });
  });

  it('rejects heterogeneous lists with a stable diagnostic', () => {
    expect(() => parseSnbt('[1, 2L]')).toThrowError(
      expect.objectContaining<Partial<SnbtParseError>>({ code: 'SNBT_HETEROGENEOUS_LIST' }),
    );
  });

  it('requires the complete input to be consumed', () => {
    expect(() => parseSnbt('{} trailing')).toThrowError(
      expect.objectContaining<Partial<SnbtParseError>>({ code: 'SNBT_TRAILING_INPUT' }),
    );
  });
});
