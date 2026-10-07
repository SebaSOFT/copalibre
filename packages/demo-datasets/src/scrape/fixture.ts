import { readFileSync } from 'node:fs';

/** Reads a trimmed portal fragment from `fixtures/`: real markup shape, invented people. */
export function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}
