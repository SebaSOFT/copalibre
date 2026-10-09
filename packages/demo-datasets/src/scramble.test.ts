import { createScrambler, fold, loadGivenNamePool, loadSurnamePool } from './scramble.js';

const POOL = ['Alba', 'Bravo', 'Cano', 'Duran', 'Egea', 'Farias', 'Gil', 'Haro'];

describe('createScrambler', () => {
  it('is deterministic for the same seed, keys and order', () => {
    const run = () => {
      const scrambler = createScrambler({ seed: 's/v1', pool: POOL, realSurnames: [] });
      return ['player:1', 'player:2', 'player:3'].map((key) => scrambler.replacementFor(key));
    };
    expect(run()).toEqual(run());
  });

  it('returns the same surname for a repeated key and different ones for different keys', () => {
    const scrambler = createScrambler({ seed: 's/v1', pool: POOL, realSurnames: [] });
    const first = scrambler.replacementFor('player:1');
    expect(scrambler.replacementFor('player:1')).toBe(first);
    const others = POOL.slice(1).map((_, index) =>
      scrambler.replacementFor(`player:${index + 10}`),
    );
    expect(new Set([first, ...others]).size).toBe(POOL.length);
  });

  it('changes with the seed', () => {
    const keys = ['player:1', 'player:2', 'player:3', 'player:4'];
    const a = createScrambler({ seed: 'a', pool: POOL, realSurnames: [] });
    const b = createScrambler({ seed: 'b', pool: POOL, realSurnames: [] });
    expect(keys.map((key) => a.replacementFor(key))).not.toEqual(
      keys.map((key) => b.replacementFor(key)),
    );
  });

  it('never returns a surname sharing a word with a real one, ignoring case and accents', () => {
    const scrambler = createScrambler({
      seed: 's',
      pool: POOL,
      realSurnames: ['ALBA', 'De La Cañó', 'Fárias Gil'],
    });
    const used = Array.from({ length: 4 }, (_, index) =>
      scrambler.replacementFor(`player:${index}`),
    );
    for (const banned of ['Alba', 'Farias', 'Gil']) expect(used).not.toContain(banned);
    expect(new Set(used).size).toBe(4);
  });

  it('never exposes the surname it replaces: output ignores the real name entirely', () => {
    const one = createScrambler({ seed: 's', pool: POOL, realSurnames: ['Perez'] });
    const two = createScrambler({ seed: 's', pool: POOL, realSurnames: ['Perez'] });
    expect(one.replacementFor('player:9')).toBe(two.replacementFor('player:9'));
  });

  it('fails clearly when the pool runs out', () => {
    const scrambler = createScrambler({ seed: 's', pool: ['Alba', 'Bravo'], realSurnames: [] });
    scrambler.replacementFor('a');
    scrambler.replacementFor('b');
    expect(() => scrambler.replacementFor('c')).toThrow('pool exhausted after 2');
  });
});

describe('committed surname pool', () => {
  it('is large, unique, accent-free and capitalised', async () => {
    const pool = await loadSurnamePool();
    expect(pool.length).toBeGreaterThanOrEqual(400);
    expect(new Set(pool.map(fold)).size).toBe(pool.length);
    for (const surname of pool) {
      expect(surname).toBe(surname.normalize('NFD').replace(/[̀-ͯ]/g, ''));
      expect(surname).toMatch(/^[A-Z][a-z]+$/);
    }
  });

  it('replaces 300 players without collision even when 100 pool names are excluded', async () => {
    const pool = await loadSurnamePool();
    const scrambler = createScrambler({ seed: 'x', pool, realSurnames: pool.slice(0, 100) });
    const out = Array.from({ length: 300 }, (_, index) =>
      scrambler.replacementFor(`player:${index}`),
    );
    expect(new Set(out).size).toBe(300);
    for (const real of pool.slice(0, 100)) expect(out).not.toContain(real);
  });
});

describe('committed given-name pool', () => {
  it('is unique, accent-free and capitalised', async () => {
    const pool = await loadGivenNamePool();
    expect(pool.length).toBeGreaterThanOrEqual(80);
    expect(new Set(pool.map(fold)).size).toBe(pool.length);
    for (const name of pool) expect(name).toMatch(/^[A-Z][a-z]+$/);
  });
});
