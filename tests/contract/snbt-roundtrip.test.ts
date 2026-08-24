import { describe, expect, it } from 'vitest';
import { snbtSemanticallyEqual } from '../../src/snbt/compare.ts';
import { parseSnbt } from '../../src/snbt/parser.ts';
import { writeSnbt } from '../../src/snbt/writer.ts';

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
});
