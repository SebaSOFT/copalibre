import * as argon2 from 'argon2';

/**
 * Native password hashing.
 *
 * Argon2id with 64 MiB of memory, three passes and four lanes: above the
 * OWASP minimum for Argon2id (19 MiB, two passes, one lane) and the values
 * every hash stored so far was made with, so nothing needs rehashing today.
 * They are written out rather than left to the library's defaults, so a
 * library upgrade cannot change them silently; a hash made with other values
 * is rehashed at the next successful sign-in.
 *
 * Each hash carries its own random salt and its parameters, in the PHC
 * string format argon2 produces.
 */
export const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
} as const;

/** Longest password accepted; hashing cost grows with input length. */
export const MAX_PASSWORD_LENGTH = 1024;
export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, PASSWORD_HASH_OPTIONS);
}

let decoyHash: Promise<string> | undefined;

/**
 * Verifies a password against a stored hash. With no stored hash, it still
 * verifies against a decoy and answers false, so an unknown email takes as
 * long as a wrong password and the response time does not say which
 * accounts exist.
 */
export async function verifyPassword(
  storedHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!storedHash) {
    decoyHash ??= hashPassword('copalibre-decoy-password');
    await argon2.verify(await decoyHash, password).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    // An unreadable stored hash is a failed sign-in, not a server error.
    return false;
  }
}

/** Whether a stored hash was made with other parameters than the current ones. */
export function passwordNeedsRehash(storedHash: string): boolean {
  try {
    return argon2.needsRehash(storedHash, PASSWORD_HASH_OPTIONS);
  } catch {
    return false;
  }
}
