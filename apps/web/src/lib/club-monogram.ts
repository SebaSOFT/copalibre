/**
 * The letters a club chip shows when the club has no emblem: the initials of
 * its first two words, so "Club Atlético Talleres" reads `CA` and a one-word
 * name reads as its first two letters.
 */
export function clubMonogram(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters =
    words.length >= 2
      ? words.slice(0, 2).map((word) => Array.from(word)[0] ?? '')
      : Array.from(words[0] ?? '').slice(0, 2);
  return letters.join('').toLocaleUpperCase();
}
