import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { questSpecSchema } from '../../src/spec/schema.ts';

const schemaPath = fileURLToPath(new URL('../../../../schema/questspec-1.json', import.meta.url));

it('keeps the published JSON Schema synchronized with the compiler contract', async () => {
  expect(JSON.parse(await readFile(schemaPath, 'utf8'))).toEqual(questSpecSchema);
});
