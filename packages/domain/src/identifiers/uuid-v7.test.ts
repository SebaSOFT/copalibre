import { InvalidUuidError } from '../errors.js';
import { UuidV7 } from './uuid-v7.js';

describe('UuidV7', () => {
  it('generates identifiers matching the RFC 9562 v7 shape', () => {
    const id = UuidV7.generate();
    expect(id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('sorts sequentially generated identifiers in generation order', () => {
    const ids = Array.from({ length: 2000 }, () => UuidV7.generate().value);
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it('remains ordered when generated within the same millisecond', () => {
    // Back-to-back generation lands many identifiers in the same millisecond;
    // the uuid library's internal sequence keeps them strictly ordered.
    const a = UuidV7.generate();
    const b = UuidV7.generate();
    const c = UuidV7.generate();
    expect(a.compare(b)).toBe(-1);
    expect(b.compare(c)).toBe(-1);
  });

  it('embeds a recoverable millisecond timestamp', () => {
    const before = Date.now();
    const id = UuidV7.generate();
    // Same-ms monotonic borrowing may nudge the embedded ts forward slightly.
    expect(id.timestampMs()).toBeGreaterThanOrEqual(before);
    expect(id.timestampMs()).toBeLessThanOrEqual(Date.now() + 5);
  });

  it('parses a valid v7 string case-insensitively', () => {
    const generated = UuidV7.generate();
    const parsed = UuidV7.create(generated.value.toUpperCase());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.equals(generated)).toBe(true);
    }
  });

  it('rejects a v4 UUID with a typed error', () => {
    // Version nibble 4 — valid UUID, wrong version.
    const result = UuidV7.create('9b2c8f70-58a1-4b7e-9d34-2f5a6c81e0aa');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InvalidUuidError);
      expect(result.error.code).toBe('INVALID_UUID_V7');
    }
  });

  it('rejects a ULID-shaped string', () => {
    const result = UuidV7.create('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(result.ok).toBe(false);
  });

  it('rejects arbitrary garbage', () => {
    for (const input of ['', 'not-a-uuid', '01890000-0000-7000-c000-000000000001']) {
      expect(UuidV7.create(input).ok).toBe(false);
    }
  });

  it('compares equal identifiers as 0', () => {
    const id = UuidV7.generate();
    const same = UuidV7.create(id.value);
    expect(same.ok && id.compare(same.value)).toBe(0);
  });
});
