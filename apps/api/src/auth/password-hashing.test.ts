import * as argon2 from 'argon2';
import {
  PASSWORD_HASH_OPTIONS,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from './password-hashing.js';

describe('password hashing', () => {
  it('writes Argon2id hashes with the pinned parameters and a fresh salt', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');
    expect(first).toMatch(/^\$argon2id\$v=19\$m=65536,p=4,t=3\$/);
    expect(first).not.toBe(second);
    expect(PASSWORD_HASH_OPTIONS.memoryCost).toBeGreaterThanOrEqual(19 * 1024);
  });

  it('verifies the right password and refuses a wrong one', async () => {
    const hash = await hashPassword('right-password');
    await expect(verifyPassword(hash, 'right-password')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('answers false for a missing or unreadable hash instead of throwing', async () => {
    await expect(verifyPassword(undefined, 'anything')).resolves.toBe(false);
    await expect(verifyPassword(null, 'anything')).resolves.toBe(false);
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('spends a real verification on an unknown account', async () => {
    const hash = await hashPassword('warm-up');
    await verifyPassword(undefined, 'warm-up');
    const time = async (stored: string | undefined) => {
      const start = process.hrtime.bigint();
      await verifyPassword(stored, 'some-password');
      return Number(process.hrtime.bigint() - start) / 1e6;
    };
    const known = await time(hash);
    const unknown = await time(undefined);
    // Same order of magnitude: the unknown path is not an early return.
    expect(unknown).toBeGreaterThan(known / 4);
  });

  it('asks for a rehash only when the parameters differ', async () => {
    expect(passwordNeedsRehash(await hashPassword('x'))).toBe(false);
    const older = await argon2.hash('x', {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
    expect(passwordNeedsRehash(older)).toBe(true);
    expect(passwordNeedsRehash('not-a-hash')).toBe(false);
  });
});
