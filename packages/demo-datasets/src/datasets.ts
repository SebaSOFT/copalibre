import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DemoDataset } from './types.js';

/** `datasets/` beside the package's `src/` (and `dist/`). */
export function datasetsRoot(): string {
  return fileURLToPath(new URL('../datasets/', import.meta.url));
}

export function datasetDirectory(alias: string, root: string = datasetsRoot()): string {
  return path.join(root, alias);
}

/** Aliases of every dataset directory that holds a `dataset.json`. */
export async function listDatasetAliases(root: string = datasetsRoot()): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const aliases: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await readFile(path.join(root, entry.name, 'dataset.json'));
      aliases.push(entry.name);
    } catch {
      // not a dataset directory
    }
  }
  return aliases.sort();
}

export async function readDataset(
  alias: string,
  root: string = datasetsRoot(),
): Promise<DemoDataset> {
  const file = path.join(datasetDirectory(alias, root), 'dataset.json');
  return JSON.parse(await readFile(file, 'utf8')) as DemoDataset;
}
