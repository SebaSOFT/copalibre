import { randomBytes } from 'node:crypto';
import { InvalidUuidError } from '../errors';
import { err, ok, type Result } from '../result';

/**
 * RFC 9562 UUID version 7: 48-bit unix-ms timestamp, version nibble 7,
 * variant 10xx. The canonical hex form sorts lexicographically by creation
 * time, which is why CopaLibre mandates v7 (never v4 or ULID) for every
 * persistent identifier — see chaos-vault naming-conventions decision.
 */
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Monotonic state guaranteeing strict ordering for identifiers generated in
// the same process, even within one millisecond (RFC 9562 §6.2, method 1:
// dedicated counter in rand_a).
let lastTimestampMs = -1;
let counter = 0;

export class UuidV7 {
  private constructor(readonly value: string) {}

  static generate(nowMs: number = Date.now()): UuidV7 {
    let ts = nowMs;
    if (ts <= lastTimestampMs) {
      ts = lastTimestampMs;
      counter += 1;
      if (counter > 0xfff) {
        // 12-bit counter exhausted within one ms: borrow the next millisecond.
        ts += 1;
        counter = 0;
      }
    } else {
      counter = 0;
    }
    lastTimestampMs = ts;

    const tsHex = ts.toString(16).padStart(12, '0');
    const counterHex = counter.toString(16).padStart(3, '0');
    const rand = randomBytes(8);
    // Variant bits 10xx on the first nibble of the final group of 62 random bits.
    const variantNibble = (8 + ((rand[0] ?? 0) & 0x03)).toString(16);
    const randHex = rand.toString('hex').slice(1, 16);

    const raw = `${tsHex.slice(0, 8)}-${tsHex.slice(8)}-7${counterHex}-${variantNibble}${randHex.slice(0, 3)}-${randHex.slice(3)}`;
    return new UuidV7(raw);
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
