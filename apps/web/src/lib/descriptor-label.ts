/** A descriptor display field as the API ships it: a plain string, or one text per language. */
export type DescriptorLabel = string | Readonly<Record<string, string | undefined>>;

/** `table-official` → `Table official`: a readable stand-in for a code nobody labelled. */
export function humanizeCode(code: string): string {
  const words = code.replace(/[-_.]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Picks the text a reader of `locale` should see for a discipline descriptor's label.
 *
 * Chain: the exact locale (`pt-BR`), its language (`pt`), English, whichever language the
 * descriptor does ship, and finally the humanized code. A raw code is never the answer while a
 * label exists, and a module that ships only English still reads as a word on a Spanish page.
 */
export function descriptorLabel(
  label: DescriptorLabel | undefined,
  locale: string,
  code: string,
): string {
  if (typeof label === 'string') return label;
  if (label !== undefined) {
    const language = locale.split('-')[0] ?? locale;
    const first = Object.values(label).find((text) => text !== undefined && text !== '');
    const picked = label[locale] ?? label[language] ?? label.en ?? first;
    if (picked) return picked;
  }
  return humanizeCode(code);
}
