import { UuidV7 } from '@copalibre/domain';
import { newId } from './ids';

describe('newId', () => {
  it('generates a valid UUIDv7 (version nibble 7, variant 10xx)', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(UuidV7.create(id).ok).toBe(true);
  });

  it('generates time-ordered identifiers so primary keys stay insert-ordered', () => {
    const ids = Array.from({ length: 500 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });

  it('never repeats', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect(new Set(ids).size).toBe(1000);
  });
});
