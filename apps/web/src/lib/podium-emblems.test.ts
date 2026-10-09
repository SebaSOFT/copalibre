import { describe, expect, it } from '@jest/globals';
import type {
  PublicTournamentEntrantPodiumResponse,
  PublicTournamentListingItemResponse,
  PublicTournamentWinnerZoneResponse,
} from '@copalibre/api/src/dto/public-tournament.dto.js';
import { withListingPodiumEmblems, withPodiumEmblems } from './podium-emblems.ts';

const entrant = (
  id: string,
  extra: Partial<PublicTournamentEntrantPodiumResponse> = {},
): PublicTournamentEntrantPodiumResponse => ({ entrantId: id, name: `Club ${id}`, ...extra });

const zone = (): PublicTournamentWinnerZoneResponse => ({
  zoneName: 'Copa Oro',
  champion: entrant('a', { clubId: 'club-a', emblemObjectId: 'obj-a' }),
  champions: [
    entrant('a', { clubId: 'club-a', emblemObjectId: 'obj-a' }),
    entrant('b', { clubId: 'club-b' }),
  ],
  runnerUp: entrant('c', { clubId: 'club-c', emblemObjectId: 'obj-c' }),
});

describe('withPodiumEmblems', () => {
  it('resolves a same-origin emblem URL for each placing whose club has an emblem', () => {
    const [resolved] = withPodiumEmblems('liga uno', [zone()]);
    expect(resolved?.champion.emblemSrc).toBe('/organizations/liga%20uno/clubs/club-a/emblem');
    expect(resolved?.champions?.[0]?.emblemSrc).toBe(
      '/organizations/liga%20uno/clubs/club-a/emblem',
    );
    expect(resolved?.runnerUp?.emblemSrc).toBe('/organizations/liga%20uno/clubs/club-c/emblem');
  });

  it('leaves a placing without an uploaded emblem for the placeholder shield', () => {
    const [resolved] = withPodiumEmblems('liga', [zone()]);
    expect(resolved?.champions?.[1]?.emblemSrc).toBeUndefined();
    expect(resolved?.thirdPlace).toBeUndefined();
  });
});

describe('withListingPodiumEmblems', () => {
  const item = (winners?: PublicTournamentWinnerZoneResponse[]) =>
    ({ alias: 'cup', winners }) as PublicTournamentListingItemResponse;

  it('returns an item without winners untouched', () => {
    const upcoming = item();
    expect(withListingPodiumEmblems('liga', upcoming)).toBe(upcoming);
  });

  it('adds emblem URLs to the winners of a finished item', () => {
    const resolved = withListingPodiumEmblems('liga', item([zone()]));
    expect(resolved.winners?.[0]).toMatchObject({
      champion: { emblemSrc: '/organizations/liga/clubs/club-a/emblem' },
    });
  });
});
