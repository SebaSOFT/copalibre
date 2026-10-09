/** Collapses runs of whitespace and trims. */
export function clean(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** `ALDO CANTONI` becomes `Aldo Cantoni`; small words such as `de` and `del` stay lowercase. */
export function titleCase(value: string): string {
  const small = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'al', 'el']);
  return clean(value)
    .toLowerCase()
    .split(' ')
    .map((word, index) =>
      index > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

/** `Club Union Dep Bancaria` becomes `club-union-dep-bancaria`; accents are folded. */
export function toAlias(value: string): string {
  return clean(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

/** `02/11/2025` and `11:15` become `2025-11-02T11:15`. */
export function toLocalIso(date: string, time: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(clean(date));
  const clock = /^(\d{1,2}):(\d{2})$/.exec(clean(time));
  if (!match || !clock) throw new Error(`unreadable date or time "${date}" "${time}"`);
  return `${match[3]}-${match[2]}-${match[1]}T${clock[1]?.padStart(2, '0')}:${clock[2]}`;
}

export interface SplitName {
  readonly surname: string;
  readonly givenNames: string;
}

/** `ACIAR , ROBERTO MATIAS` and `BUENO ,LEANDRO` become surname and given names; a name with no comma is read as `SURNAME GIVEN`. */
export function splitName(value: string): SplitName {
  const text = clean(value);
  const comma = text.indexOf(',');
  if (comma < 0) {
    // Some sources print `SURNAME GIVEN` with no comma: the first word is the surname.
    const [first = '', ...rest] = text.split(' ');
    return { surname: first, givenNames: rest.join(' ') };
  }
  return { surname: clean(text.slice(0, comma)), givenNames: clean(text.slice(comma + 1)) };
}

/** A comparison key that ignores case, accents and spacing around commas. */
export function nameKey(value: string): string {
  const { surname, givenNames } = splitName(value);
  return `${surname}|${givenNames}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
}
