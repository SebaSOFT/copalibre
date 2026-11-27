import type { SupportedLanguage } from '@copalibre/domain';

/**
 * An expiry as a reader meets it: a date and time in the email's language, with the zone named,
 * because the recipient may not be where the organization is. `dateStyle` cannot carry a zone name,
 * so the fields are spelled out.
 */
export function formatEmailExpiry(
  at: string,
  language: SupportedLanguage,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(language, {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(at));
}
