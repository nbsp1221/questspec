import { performance } from 'node:perf_hooks';
import { snbtCompound, snbtInt, snbtList, snbtString } from '../src/snbt/build.ts';
import { parseSnbtCompound } from '../src/snbt/parser.ts';
import { writeSnbt } from '../src/snbt/writer.ts';

const synthetic = snbtCompound(
  Array.from({ length: 1_000 }, (_, index) => [
    `quest_${index}`,
    snbtCompound([
      ['id', snbtString(index.toString(16).toUpperCase().padStart(16, '0'))],
      ['order_index', snbtInt(index)],
      ['tasks', snbtList([snbtString(`minecraft:item_${index}`)])],
    ]),
  ]),
);
const source = writeSnbt(synthetic);
const iterations = 100;
const started = performance.now();
for (let iteration = 0; iteration < iterations; iteration += 1) {
  writeSnbt(parseSnbtCompound(source));
}
const elapsedMilliseconds = performance.now() - started;
console.log(
  JSON.stringify({
    bytes: Buffer.byteLength(source),
    elapsedMilliseconds: Math.round(elapsedMilliseconds * 100) / 100,
    iterations,
    operationsPerSecond: Math.round((iterations / elapsedMilliseconds) * 100_000) / 100,
  }),
);
