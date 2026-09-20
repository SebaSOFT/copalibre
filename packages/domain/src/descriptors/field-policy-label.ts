import { resolveLabel, type LocalizedLabel } from '../i18n-label.js';
import type { FieldPolicy } from './override-policy.js';
import type { SupportedLanguage } from '../i18n.js';

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

/** Resolves a field's display name: its declared `label`, or a humanized dot-path fallback. */
export function resolveFieldPolicyLabel(
  dotPath: string,
  policy: FieldPolicy,
  language: SupportedLanguage,
): string {
  if (policy.label === undefined) return humanizeFieldPath(dotPath);
  return resolveLabel(policy.label as string | LocalizedLabel, language);
}
