import {
  pending,
  storyClient,
  storyIntl,
  ids,
  consoleProjection,
  projection,
  registrations,
} from './screen-story-fixtures.js';
import { messages } from '../i18n/messages.en.js';
describe('screen story fixtures', () => {
  it('rejects an undeclared read and allows explicitly absent capabilities', async () => {
    const client = storyClient<{
      read: () => Promise<number>;
      optional?: () => void;
      missing: () => void;
    }>({ read: async () => 7, optional: undefined });
    await expect(client.read()).resolves.toBe(7);
    expect(client.optional).toBeUndefined();
    expect(() => client.missing).toThrow('Story has no fixture for missing');
    expect(Reflect.get(client, Symbol.toStringTag)).toBeUndefined();
    expect(Reflect.get(client, 'then')).toBeUndefined();
    expect(Reflect.get(client, 'toJSON')).toBeUndefined();
  });
  it('keeps loading unresolved without timers', async () => {
    const marker = Symbol();
    expect(await Promise.race([pending(), Promise.resolve(marker)])).toBe(marker);
  });
  it('uses the real locale catalogs and a safe default', () => {
    expect(storyIntl('de').formatMessage(messages.auditTrailTitle)).not.toBe(
      storyIntl('en').formatMessage(messages.auditTrailTitle),
    );
    expect(storyIntl('unknown').locale).toBe('en');
    expect(storyIntl(undefined).locale).toBe('en');
  });
  it('keeps shared entrants and projection references coherent', () => {
    expect(consoleProjection.entrants.map((e) => e.entrantId)).toEqual([ids.first, ids.second]);
    expect(consoleProjection.events[0].segmentId).toBe(consoleProjection.segments[0].segmentId);
    expect(projection.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(registrations.map((row) => row.status)).toEqual(['pending', 'accepted', 'accepted']);
  });
});
