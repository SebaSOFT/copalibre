import { v7 as generateUuidV7 } from 'uuid';
import { InvalidUuidError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * RFC 9562 UUID version 7: 48-bit unix-ms timestamp, version nibble 7,
 * variant 10xx. The canonical hex form sorts lexicographically by creation
 * time, which is why CopaLibre mandates v7 (never v4 or ULID) for every
 * persistent identifier — see chaos-vault naming-conventions decision.
 *
 * Generation is delegated to the standard `uuid` package (RFC 9562 v7 with
 * monotonic ordering, isomorphic Node/browser); this value object owns what
 * is CopaLibre domain logic: strict v7-only validation, comparison, and the
 * embedded-timestamp accessor.
 */
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class UuidV7 {
  private constructor(readonly value: string) {}

  // No caller-supplied clock: uuid's monotonic ordering guarantee only holds
  // for plain v7() calls sharing the library's internal sequence state.
  static generate(): UuidV7 {
    return new UuidV7(generateUuidV7());
  }

  static create(input: string): Result<UuidV7, InvalidUuidError> {
    const normalized = input.toLowerCase();
    if (!UUID_V7_PATTERN.test(normalized)) {
      return err(new InvalidUuidError(`Not a valid RFC 9562 UUIDv7: "${input}"`, { input }));
    }
    return ok(new UuidV7(normalized));
  }

  /** Millisecond timestamp embedded in the identifier. */
  timestampMs(): number {
    return parseInt(this.value.slice(0, 8) + this.value.slice(9, 13), 16);
  }

  compare(other: UuidV7): -1 | 0 | 1 {
    if (this.value < other.value) return -1;
    if (this.value > other.value) return 1;
    return 0;
  }

  equals(other: UuidV7): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
