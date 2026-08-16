import type { LocalizedLabel } from '@copalibre/domain';

/** Resolves a discipline-declared label (table headers, layout names) to the requested language, falling back to English. */
export function localizedText(value: string | LocalizedLabel, locale: string): string {
  if (typeof value === 'string') return value;
  const short = locale.split('-')[0];
  const translated = short === undefined ? undefined : (value as Record<string, string>)[short];
  return translated ?? value.en;
}
