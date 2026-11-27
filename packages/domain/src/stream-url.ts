import { DomainError } from './errors.js';

/** The longest stream link the database and the page accept. */
export const MAX_STREAM_URL_LENGTH = 2048;

export class InvalidStreamUrlError extends DomainError {
  readonly code = 'INVALID_STREAM_URL';
}

/**
 * Validates a match's stream link. Only an absolute `http:` or `https:` URL of at most
 * {@link MAX_STREAM_URL_LENGTH} characters is usable. An empty value clears the link. CopaLibre does not
 * judge which streaming service a link points at.
 */
export function normalizeStreamUrl(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_STREAM_URL_LENGTH) {
    throw new InvalidStreamUrlError('Stream link is longer than 2048 characters', {
      maxLength: MAX_STREAM_URL_LENGTH,
    });
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new InvalidStreamUrlError('Stream link must be an absolute http or https URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new InvalidStreamUrlError('Stream link must be an absolute http or https URL');
  }
  return trimmed;
}
