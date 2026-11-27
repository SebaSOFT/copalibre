import { resolveLabel, type LocalizedLabel, type SupportedLanguage } from '@copalibre/domain';

export interface EventLabelInput {
  readonly label?: string;
  readonly labels?: LocalizedLabel;
  readonly definitionCode?: string;
}

/**
 * Resolves a discipline event's display label in the viewer's language:
 * page language → tournament primary language → `resolveLabel` (English / first map entry) →
 * `event.label` → `event.definitionCode`.
 */
export function eventLabel(
  event: EventLabelInput,
  language: SupportedLanguage = 'en',
  primaryLanguage: SupportedLanguage = 'en',
): string {
  const map = event.labels as Partial<Record<SupportedLanguage, string>> | undefined;
  if (map) {
    const inLanguage = map[language];
    if (inLanguage) return inLanguage;
    const inPrimary = map[primaryLanguage];
    if (inPrimary) return inPrimary;
    if (event.labels) {
      const resolved = resolveLabel(event.labels, language);
      if (resolved) return resolved;
      const firstValue = Object.values(map).find(
        (value) => typeof value === 'string' && value.length > 0,
      );
      if (firstValue) return firstValue;
    }
  }
  return event.label ?? event.definitionCode ?? '';
}
