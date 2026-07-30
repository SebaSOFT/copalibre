import { UuidV7 } from '@copalibre/domain';

/**
 * The single identifier-generation helper every insert path uses — UUIDv7
 * only (never v4/ULID), delegated to the domain value object, which itself
 * delegates to the `uuid` library.
 */
export function newId(): string {
  return UuidV7.generate().value;
}
