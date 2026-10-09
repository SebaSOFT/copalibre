import type { SupportedLanguage } from '@copalibre/domain';

const SPANISH_SUFFIX_M = ['', 'er', 'do', 'er', 'to', 'to', 'to', 'mo', 'vo', 'no', 'mo'] as const;
const SPANISH_SUFFIX_F = ['', 'ra', 'da', 'ra', 'ta', 'ta', 'ta', 'ma', 'va', 'na', 'ma'] as const;

/**
 * A feminine noun, read from how it ends. A discipline's segment names are free text, so the
 * grammatical gender is not known and is inferred: "vuelta", "manga", "mitad" and "etapa" are
 * feminine, "tiempo", "set" and "cuarto" are not. Only the languages that inflect the ordinal use it.
 */
function isFeminine(label: string, endings: RegExp): boolean {
  return endings.test(label.trim().split(/\s+/)[0]?.toLowerCase() ?? '');
}

function englishSuffix(n: number): string {
  const rule = new Intl.PluralRules('en', { type: 'ordinal' }).select(n);
  return rule === 'one' ? 'st' : rule === 'two' ? 'nd' : rule === 'few' ? 'rd' : 'th';
}

function spanish(n: number, label: string): string {
  const table = isFeminine(label, /(a|d|ión)$/) ? SPANISH_SUFFIX_F : SPANISH_SUFFIX_M;
  // Past the tenth the written ordinal is a number and a bare "º"/"ª"; "er" and "ra" apply to 1 and 3.
  const suffix = n < table.length ? table[n] : table === SPANISH_SUFFIX_F ? 'a' : 'o';
  return `${n}${suffix} ${label}`;
}

/**
 * A segment named by its place in the match: "2nd Half", "2do tiempo", "3er Set", "2da vuelta". The
 * label is the discipline's own name for the segment type, so the sport decides whether it is a
 * half, a lap or a set; this adds the language's ordinal.
 */
export function segmentOrdinalLabel(
  label: string,
  ordinal: number,
  language: SupportedLanguage,
): string {
  switch (language) {
    case 'es':
      return spanish(ordinal, label);
    case 'pt':
    case 'it':
      return `${ordinal}${isFeminine(label, /a$/) ? 'ª' : 'º'} ${label}`;
    case 'fr':
      return `${ordinal}${ordinal === 1 ? (isFeminine(label, /e$/) ? 're' : 'er') : 'e'} ${label}`;
    case 'de':
      return `${ordinal}. ${label}`;
    case 'ru': {
      const noun = label.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
      return `${ordinal}-${/[аяь]$/.test(noun) ? 'я' : /[ое]$/.test(noun) ? 'е' : 'й'} ${label}`;
    }
    case 'zh':
      return `第${ordinal}${label}`;
    case 'en':
      return `${ordinal}${englishSuffix(ordinal)} ${label}`;
  }
}
