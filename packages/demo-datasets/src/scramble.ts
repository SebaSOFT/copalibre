import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export interface ScramblerOptions {
  /** A fixed string committed with the dataset, for example `panamericano-clubes-2025/v1`. */
  readonly seed: string;
  /** Candidate replacement surnames, in a stable order. */
  readonly pool: readonly string[];
  /** Every real surname in the source. No replacement shares a word with any of them. */
  readonly realSurnames: Iterable<string>;
}

export interface Scrambler {
  /**
   * The replacement name for an opaque key (for example `player:7870` or
   * `referee:3`). The same key always gets the same name, and no two keys
   * share one. The real name is never an input.
   */
  replacementFor(key: string): string;
}

/** Lowercase, accent-free comparison form of a name word. */
export function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function words(value: string): string[] {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

/**
 * Deterministic surname replacement.
 *
 * Each key hashes (with the seed) to a start position in the candidate list;
 * a taken surname advances to the next free one. Candidates are the pool
 * minus any surname that shares a word with a real surname, so the output can
 * never contain a real surname by coincidence either. The result depends on
 * the keys alone, never on the surnames being replaced, so it cannot be
 * reversed from the dataset. Callers must request keys in a stable order
 * (for example ascending player id) for byte-identical reruns.
 */
export function createScrambler(options: ScramblerOptions): Scrambler {
  const excluded = new Set<string>();
  for (const surname of options.realSurnames) {
    for (const word of words(surname)) excluded.add(word);
  }
  const candidates = options.pool.filter((surname) => !words(surname).some((w) => excluded.has(w)));
  const assigned = new Map<string, string>();
  const taken = new Set<number>();

  return {
    replacementFor(key: string): string {
      const known = assigned.get(key);
      if (known !== undefined) return known;
      if (taken.size >= candidates.length) {
        throw new Error(`surname pool exhausted after ${candidates.length} replacements`);
      }
      const digest = createHash('sha256').update(`${options.seed}:${key}`).digest();
      let index = digest.readUInt32BE(0) % candidates.length;
      while (taken.has(index)) index = (index + 1) % candidates.length;
      taken.add(index);
      const surname = candidates[index] as string;
      assigned.set(key, surname);
      return surname;
    },
  };
}

async function loadPool(name: string): Promise<string[]> {
  const file = new URL(`../schema/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(file, 'utf8')) as string[];
}

/** The committed pool of replacement surnames. */
export function loadSurnamePool(): Promise<string[]> {
  return loadPool('surname-pool');
}

/** The committed pool of replacement given names, used for officials whose names the source prints inconsistently. */
export function loadGivenNamePool(): Promise<string[]> {
  return loadPool('given-name-pool');
}
