import { describe, expect, it } from 'vitest';
import type { SnbtTag } from '../../src/snbt/ast.ts';
import {
  snbtBoolean,
  snbtCompound,
  snbtDouble,
  snbtInt,
  snbtList,
  snbtLong,
  snbtString,
} from '../../src/snbt/build.ts';
import { snbtSemanticallyEqual } from '../../src/snbt/compare.ts';
import { parseSnbt } from '../../src/snbt/parser.ts';
import { writeSnbt } from '../../src/snbt/writer.ts';

describe('generated SNBT regression inputs', () => {
  it('round-trips deterministic generated typed trees', () => {
    const random = createRandom(0x51_4e_42_54);
    for (let index = 0; index < 500; index += 1) {
      const value = generatedTag(random, 0);
      expect(snbtSemanticallyEqual(parseSnbt(writeSnbt(value)), value), `case ${index}`).toBe(true);
    }
  });

  it('always terminates on deterministic arbitrary text', () => {
    const random = createRandom(0x46_54_42_51);
    const alphabet = '{}[]:=,;"\\# abcdef0123456789bBsSlLfFdD_-.\n';
    for (let index = 0; index < 1_000; index += 1) {
      const length = Math.floor(random() * 80);
      const source = Array.from(
        { length },
        () => alphabet[Math.floor(random() * alphabet.length)],
      ).join('');
      try {
        parseSnbt(source);
      } catch {
        // Invalid generated text is expected; termination is the contract.
      }
    }
  });
});

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function generatedTag(random: () => number, depth: number): SnbtTag {
  const scalarFactories = [
    () => snbtBoolean(random() > 0.5),
    () => snbtDouble(Math.round((random() - 0.5) * 20_000) / 10),
    () => snbtInt(Math.floor((random() - 0.5) * 100_000)),
    () => snbtLong(BigInt(Math.floor(random() * 1_000_000))),
    () => snbtString(`value_${Math.floor(random() * 1_000)}_"\\`),
  ];
  if (depth >= 3 || random() < 0.55) {
    return scalarFactories[Math.floor(random() * scalarFactories.length)]();
  }
  if (random() < 0.5) {
    const length = Math.floor(random() * 4);
    return snbtCompound(
      Array.from({ length }, (_, index) => [
        `key_${index}_${Math.floor(random() * 1_000)}`,
        generatedTag(random, depth + 1),
      ]),
    );
  }
  const length = Math.floor(random() * 5);
  const strings = random() < 0.5;
  return snbtList(
    Array.from({ length }, () =>
      strings
        ? snbtString(`list_${Math.floor(random() * 1_000)}`)
        : snbtInt(Math.floor(random() * 1_000)),
    ),
  );
}
