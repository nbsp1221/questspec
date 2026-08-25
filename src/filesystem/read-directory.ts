import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export async function readSnbtDirectory(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  await walk(root, root, files);
  return files;
}

async function walk(root: string, directory: string, files: Map<string, string>): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(root, path, files);
    } else if (entry.isFile() && entry.name.endsWith('.snbt')) {
      files.set(relative(root, path).split(sep).join('/'), await readFile(path, 'utf8'));
    }
  }
}
