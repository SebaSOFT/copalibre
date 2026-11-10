/**
 * Upload names and types that come from a request body.
 *
 * An uploaded file's name becomes part of its object-storage key, and its
 * declared type was stored and later sent as `Content-Type`. Neither is
 * trusted: the name is reduced to a plain file name that cannot add a path
 * segment, and an image's type comes from its decoded format, never from the
 * client.
 */

const MAX_NAME_LENGTH = 100;

/**
 * A key-safe file name: the last path segment, letters, digits, `.`, `_` and
 * `-` only, no leading dots, at most 100 characters. `../../other/photo.png`
 * becomes `photo.png`; a name with nothing usable left becomes `upload`.
 */
export function safeObjectName(filename: string): string {
  const lastSegment = filename.split(/[\\/]/).pop() ?? '';
  const cleaned = lastSegment
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, MAX_NAME_LENGTH);
  return cleaned.length > 0 && !/^\.+$/.test(cleaned) ? cleaned : 'upload';
}

/**
 * Formats an image upload may be, by the name the decoder reports. SVG is
 * accepted for emblems; the API serves every response under
 * `default-src 'none'`, so script inside an SVG never runs.
 */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heif: 'image/avif',
};

/** The `Content-Type` for a decoded image format, or `undefined` for a format uploads do not accept. */
export function imageContentType(format: string | undefined): string | undefined {
  return format === undefined ? undefined : IMAGE_TYPES[format];
}

/** A plain `type/subtype` media type, with no parameters or anything a header could carry along. */
export function isPlainMediaType(value: string): boolean {
  return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,62}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i.test(value);
}
