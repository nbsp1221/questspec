import { describe, expect, it } from 'vitest';
import { snbtCompound, snbtDouble, snbtFloat } from '../../packages/core/src/snbt/build.ts';
import { snbtSemanticallyEqual } from '../../packages/core/src/snbt/compare.ts';
import { parseSnbt } from '../../packages/core/src/snbt/parser.ts';
import { writeSnbt } from '../../packages/core/src/snbt/writer.ts';

describe('FTB-SNBT contract', () => {
  it('preserves typed semantics across parse, write, and parse', () => {
    const source = `{
      byte: 1b
      int: 2
      text: 'hello'
      values: [1, 2, 3]
    }`;
    const parsed = parseSnbt(source);
    const reparsed = parseSnbt(writeSnbt(parsed));

    expect(snbtSemanticallyEqual(parsed, reparsed)).toBe(true);
  });

  it('ignores compound ordering and boolean presentation during semantic comparison', () => {
    const left = parseSnbt('{ alpha: true beta: 2 }');
    const right = parseSnbt('{ beta: 2 alpha: 1b }');

    expect(snbtSemanticallyEqual(left, right)).toBe(true);
  });

  it('writes sorted FTB-style multiline collections and explicit decimal types', () => {
    const parsed = parseSnbt('{ z: 0.0d a: [1, 2] }');

    expect(writeSnbt(parsed)).toBe(`{
\ta: [
\t\t1
\t\t2
\t]
\tz: 0.0d
}\n`);
  });

  it('writes exponent-form floating-point values with a valid decimal mantissa', () => {
    const value = snbtCompound([
      ['double', snbtDouble(1e21)],
      ['float', snbtFloat(-1e21)],
    ]);
    const source = writeSnbt(value);

    expect(source).toContain('double: 1.0e+21d');
    expect(source).toContain('float: -1.0e+21f');
    expect(parseSnbt(source)).toMatchObject({
      entries: [
        { key: 'double', value: { type: 'double' } },
        { key: 'float', value: { type: 'float' } },
      ],
      type: 'compound',
    });
  });
});
