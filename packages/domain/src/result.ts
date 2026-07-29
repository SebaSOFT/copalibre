/**
 * Discriminated-union result used across the domain layer so invalid input is
 * rejected with a typed error value, never a thrown string.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

/** Unwraps a Result in contexts where failure is a programming error. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw result.error instanceof Error
      ? result.error
      : new Error(`unwrap() on error result: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}
