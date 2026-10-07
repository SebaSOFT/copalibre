import { fold } from '../scramble.js';

function words(value: string): string[] {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

/**
 * Real surname words that still appear in the committed text. Words that are
 * legitimately public in the dataset (club, venue, phase and tournament names,
 * and the given names that are kept as published) are allowed.
 */
export function findLeaks(
  committedText: string,
  realSurnames: Iterable<string>,
  allowedText: Iterable<string>,
): string[] {
  const allowed = new Set<string>();
  for (const text of allowedText) for (const word of words(text)) allowed.add(word);
  const candidates = new Set<string>();
  for (const surname of realSurnames) {
    for (const word of words(surname)) if (!allowed.has(word)) candidates.add(word);
  }
  const haystack = fold(committedText);
  return [...candidates]
    .filter((word) => new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(haystack))
    .sort();
}
