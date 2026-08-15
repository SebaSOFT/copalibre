/**
 * What CopaLibre must never ship.
 *
 * sebasoft.app and CopaLibre must look unrelated, and "we reviewed it" is not a
 * control that survives a busy week. This list is scanned in CI against the
 * *generated output*, so a forbidden value reintroduced anywhere upstream fails
 * a pull request rather than a brand review months later.
 */

export interface ForbiddenPattern {
  readonly pattern: RegExp;
  readonly label: string;
  readonly why: string;
}

export const FORBIDDEN: readonly ForbiddenPattern[] = [
  {
    pattern: /#f3e600/i,
    label: 'SebaSOFT Cyberpunk Yellow',
    why: 'the other product’s signature colour; the two must look unrelated',
  },
  {
    pattern: /#c5003c/i,
    label: 'SebaSOFT crimson',
    why: 'reserved to that brand, and CopaLibre’s destructive colour is not a brand colour',
  },
  { pattern: /\bCP2077\b/i, label: 'CP2077 token name', why: 'third-party trade dress' },
  { pattern: /\bDATA_BLOB\b/i, label: 'DATA_BLOB label', why: 'sebasoft.app vocabulary' },
  { pattern: /\bTRON\b/i, label: 'TRON reference', why: 'third-party trade dress' },
  {
    pattern: /scanlines?\s*:/i,
    label: 'scanline effect',
    why: 'a cyberpunk skin, and unreadable on a venue screen',
  },
  {
    pattern: /--(cl-)?grid-glow\b/i,
    label: 'TRON grid glow',
    why: 'glow is not a state indicator here',
  },
];

export interface ForbiddenHit {
  readonly label: string;
  readonly why: string;
  readonly line: number;
  readonly excerpt: string;
}

/** Every forbidden value in some text, with the line so it can be found. */
export function scanForForbidden(text: string): readonly ForbiddenHit[] {
  const hits: ForbiddenHit[] = [];

  text.split('\n').forEach((line, index) => {
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(line)) {
        hits.push({ label: rule.label, why: rule.why, line: index + 1, excerpt: line.trim() });
      }
    }
  });

  return hits;
}

export function formatHits(source: string, hits: readonly ForbiddenHit[]): string {
  return hits
    .map((hit) => `${source}:${hit.line}  ${hit.label} — ${hit.why}\n    ${hit.excerpt}`)
    .join('\n');
}
