import sharp from 'sharp';

/**
 * The only widths an emblem rendition is made at. A fixed list bounds the
 * work and the storage per emblem to three files, which is what lets the API
 * fill a missing rendition on request without running unbounded media
 * processing in a request handler.
 */
export const EMBLEM_RENDITION_WIDTHS = [64, 128, 256] as const;

export type EmblemRenditionWidth = (typeof EMBLEM_RENDITION_WIDTHS)[number];

export const EMBLEM_RENDITION_CONTENT_TYPE = 'image/webp';

/** Raster originals get renditions; SVG needs no raster size and a GIF may be animated, so both are served as stored. */
const RENDITION_SOURCE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
]);

export function isEmblemRenditionWidth(width: number): width is EmblemRenditionWidth {
  return (EMBLEM_RENDITION_WIDTHS as readonly number[]).includes(width);
}

export function hasEmblemRenditions(contentType: string): boolean {
  return RENDITION_SOURCE_CONTENT_TYPES.has(contentType);
}

/**
 * Where a rendition lives: next to its original, with no metadata row of its
 * own. A replaced emblem is a new object with a new key, so its renditions
 * never collide with the old image's.
 */
export function emblemRenditionKey(storageKey: string, width: EmblemRenditionWidth): string {
  return `${storageKey}.w${width}.webp`;
}

/** Every derived file an original can have, for deleting them together. */
export function derivedObjectKeys(storageKey: string): readonly string[] {
  return [
    ...EMBLEM_RENDITION_WIDTHS.map((width) => emblemRenditionKey(storageKey, width)),
    // Written by earlier versions of the worker; nothing reads it.
    `${storageKey}.thumbnail`,
  ];
}

/**
 * One encoder for the worker and the API, so a rendition made on request
 * equals the one the worker writes. The original is never enlarged and its
 * transparency is kept.
 */
export async function renderEmblemRendition(
  original: Uint8Array,
  width: EmblemRenditionWidth,
): Promise<Buffer> {
  return sharp(original)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
}
