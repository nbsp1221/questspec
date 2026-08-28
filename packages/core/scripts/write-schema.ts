import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { questSpecSchema } from '../src/spec/schema.ts';

const destination = fileURLToPath(new URL('../../../schema/questspec-1.json', import.meta.url));
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(questSpecSchema, undefined, 2)}\n`, 'utf8');
