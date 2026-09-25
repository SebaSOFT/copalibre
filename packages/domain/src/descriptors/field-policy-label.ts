import { resolveLabel, type LocalizedLabel } from '../i18n-label.js';
import type { FieldPolicy } from './override-policy.js';
import type { SupportedLanguage } from '../i18n.js';

/**
 * Display names for dot-paths common enough to appear across many
 * disciplines' own field policies, so an operator sees a translated name
 * instead of a humanized-but-still-English dot-path the moment a specific
 * discipline declares no `label` of its own (openspec 0285). A humanized
 * fallback is still correct for anything discipline-specific this catalogue
 * doesn't name — this is a plain-language upgrade for the handful of
 * genuinely standard paths, not a replacement for `humanizeFieldPath`.
 */
const STANDARD_FIELD_LABELS: Readonly<Record<string, LocalizedLabel>> = {
  format: { en: 'Format', es: 'Formato' },
  segments: { en: 'Segments', es: 'Segmentos' },
  'registration.capacity': { en: 'Registration Capacity', es: 'Cupo de Inscripción' },
  'scoring.pointsPerWin': { en: 'Points Per Win', es: 'Puntos Por Victoria' },
};

/**
 * Turns a configuration dot-path into a readable name when the field's own
 * `FieldPolicy` declares no `label` — e.g. `"scoring.pointsPerWin"` becomes
 * `"Scoring › Points Per Win"`. Never applied when a label is present: an
 * author-declared label always wins over this fallback.
 */
export function humanizeFieldPath(dotPath: string): string {
  return dotPath
    .split('.')
    .map((segment) => titleCaseWord(segment))
    .join(' › ');
}

function titleCaseWord(segment: string): string {
  const spaced = segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (spaced.length === 0) return segment;
  return spaced
    .split(' ')
    .map((word) => (word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/**
 * Resolves a field's display name: its declared `label`, this platform's own
 * localized name for a standard dot-path, or a humanized dot-path fallback,
 * in that order — an author-declared label always wins, since it is the
 * more specific source.
 */
export function resolveFieldPolicyLabel(
  dotPath: string,
  policy: FieldPolicy,
  language: SupportedLanguage,
): string {
  if (policy.label !== undefined)
    return resolveLabel(policy.label as string | LocalizedLabel, language);
  const standardLabel = STANDARD_FIELD_LABELS[dotPath];
  if (standardLabel !== undefined) return resolveLabel(standardLabel, language);
  return humanizeFieldPath(dotPath);
}
