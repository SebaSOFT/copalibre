/**
 * Explicit injection token for the object-storage adapter (0032).
 *
 * The adapter itself is `ObjectStorageAdapter | undefined` — object storage
 * is optional infrastructure, and an installation with none configured
 * simply cannot accept evidence uploads, the same way an installation with
 * no SMTP provider cannot send mail.
 */
export const OBJECT_STORAGE = Symbol.for('copalibre.object-storage');
