import { resolveLabel, type LocalizedLabel } from '../i18n-label.js';
import type { FieldPolicy } from './override-policy.js';
import type { SupportedLanguage } from '../i18n.js';

/**
 * Display names for dot-paths common enough to appear across many
 * disciplines' own field policies, so an operator sees a translated name
 * instead of a humanized-but-still-English dot-path the moment a specific
 * discipline declares no `label` of its own. A humanized
 * fallback is still correct for anything discipline-specific this catalogue
 * doesn't name — this is a plain-language upgrade for the handful of
 * genuinely standard paths, not a replacement for `humanizeFieldPath`.
 */
const STANDARD_FIELD_LABELS: Readonly<Record<string, LocalizedLabel>> = {
  format: {
    en: 'Format',
    es: 'Formato',
    de: 'Format',
    fr: 'Format',
    it: 'Formato',
    pt: 'Formato',
    ru: 'Формат',
    zh: '赛制',
  },
  segments: { en: 'Segments', es: 'Segmentos' },
  'registration.capacity': { en: 'Registration Capacity', es: 'Cupo de Inscripción' },
  'scoring.pointsPerWin': {
    en: 'Points Per Win',
    es: 'Puntos Por Victoria',
    de: 'Punkte pro Sieg',
    fr: 'Points par victoire',
    it: 'Punti per vittoria',
    pt: 'Pontos por vitória',
    ru: 'Очки за победу',
    zh: '胜场积分',
  },
  'scoring.pointsPerDraw': {
    en: 'Points Per Draw',
    es: 'Puntos Por Empate',
    de: 'Punkte pro Unentschieden',
    fr: 'Points par match nul',
    it: 'Punti per pareggio',
    pt: 'Pontos por empate',
    ru: 'Очки за ничью',
    zh: '平局积分',
  },
  tiebreakers: {
    en: 'Tiebreakers',
    es: 'Desempates',
    de: 'Tie-Break-Regeln',
    fr: 'Critères de départage',
    it: 'Criteri di spareggio',
    pt: 'Critérios de desempate',
    ru: 'Критерии при равенстве',
    zh: '同分判定',
  },
  'venuePolicy.neutralGround': {
    en: 'Neutral Ground',
    es: 'Sede Neutral',
    de: 'Neutraler Platz',
    fr: 'Terrain neutre',
    it: 'Campo neutro',
    pt: 'Campo neutro',
    ru: 'Нейтральное поле',
    zh: '中立场地',
  },
};

/** This platform's own name for a standard dot-path, in every language it ships; `undefined` for any other. */
export function standardFieldLabel(dotPath: string): LocalizedLabel | undefined {
  return STANDARD_FIELD_LABELS[dotPath];
}

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
