import { describe, expect, it } from '@jest/globals';
import type { PublicOverviewStageResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import { publicIntl, sideSourceLabels } from './i18n/public-intl.js';
import type { MatchCardData } from './matches-view.js';
import {
  deriveClubKnockoutPath,
  deriveClubNextMatch,
  deriveClubResults,
  deriveClubSquad,
  deriveClubStatus,
  filterMatchesByClub,
  resolveClubFilter,
  resolveClubNextOpponentName,
  zoneAnchorSlug,
} from './club-page.js';

function match(overrides: Partial<MatchCardData> = {}): MatchCardData {
  return {
    matchId: 'm-1',
    stageNumber: 1,
    matchNumber: 1,
    state: 'upcoming',
    homeName: 'Club Hispano',
    homeClubAlias: 'club-hispano',
    homeClubId: 'club-1',
    awayName: 'Andes Talleres',
    awayClubAlias: 'andes-talleres',
    awayClubId: 'club-2',
    ...overrides,
  };
}

const club = { alias: 'club-hispano', clubId: 'club-1' };

describe('filterMatchesByClub', () => {
  it('returns all matches when clubAlias is absent and filters home/away otherwise', () => {
    const matches = [
      match({ matchId: 'm-1', homeClubAlias: 'club-hispano', awayClubAlias: 'andes-talleres' }),
      match({ matchId: 'm-2', homeClubAlias: 'san-martin', awayClubAlias: 'club-hispano' }),
      match({ matchId: 'm-3', homeClubAlias: 'san-martin', awayClubAlias: 'andes-talleres' }),
    ];

    expect(filterMatchesByClub(matches, undefined)).toHaveLength(3);
    expect(filterMatchesByClub(matches, '')).toHaveLength(3);
    expect(filterMatchesByClub(matches, 'club-hispano').map((m) => m.matchId)).toEqual([
      'm-1',
      'm-2',
    ]);
    expect(filterMatchesByClub(matches, 'unknown')).toEqual([]);
  });
});

describe('zoneAnchorSlug', () => {
  it('normalizes accented zone names into stable anchor slugs', () => {
    expect(zoneAnchorSlug('Copa de Oro · Zona 1')).toBe('copa-de-oro-zona-1');
    expect(zoneAnchorSlug('  Campeón  ')).toBe('campeon');
  });
});

describe('deriveClubStatus', () => {
  it('returns undefined when the club has no matches', () => {
    expect(
      deriveClubStatus([match({ homeClubAlias: 'other', homeClubId: 'c-other' })], club),
    ).toBeUndefined();
  });

  it('reports group stage when the club has only group-stage matches', () => {
    expect(
      deriveClubStatus(
        [
          match({
            stageNumber: 1,
            groupName: 'Grupo A',
            state: 'final',
            homeScore: 2,
            awayScore: 1,
          }),
        ],
        club,
      ),
    ).toEqual({ kind: 'groupStage' });
  });

  it('reports active knockout round with zone and roundKind', () => {
    const status = deriveClubStatus(
      [
        match({ stageNumber: 1, state: 'final', homeScore: 2, awayScore: 0 }),
        match({
          matchId: 'qf',
          stageNumber: 2,
          nodeKey: 'SE-R1-M1',
          round: 1,
          sourceFinalRound: 3,
          zoneName: 'Copa Oro',
          state: 'final',
          homeScore: 3,
          awayScore: 1,
        }),
        match({
          matchId: 'sf',
          stageNumber: 2,
          nodeKey: 'SE-R2-M1',
          round: 2,
          sourceFinalRound: 3,
          zoneName: 'Copa Oro',
          state: 'upcoming',
        }),
      ],
      club,
    );
    expect(status).toEqual({
      kind: 'inCompetition',
      zone: 'Copa Oro',
      roundKind: 'semiFinal',
      roundNumber: 2,
    });
  });

  it('prefers live knockout matches and falls back to stageName or stage metadata', () => {
    const stages: PublicOverviewStageResponse[] = [
      {
        stageNumber: 2,
        format: 'single-elimination',
        zones: [{ zoneName: 'Z1', format: 'single-elimination' }],
      },
    ];
    expect(
      deriveClubStatus(
        [
          match({
            matchId: 'semi',
            stageNumber: 2,
            stageName: 'Playoffs',
            round: 2,
            sourceFinalRound: 3,
            state: 'upcoming',
          }),
          match({
            matchId: 'final',
            stageNumber: 2,
            stageName: 'Playoffs',
            round: 3,
            sourceFinalRound: 3,
            state: 'live',
          }),
        ],
        club,
        stages,
      ),
    ).toEqual({
      kind: 'inCompetition',
      zone: 'Playoffs',
      roundKind: 'final',
      roundNumber: 3,
    });

    expect(
      deriveClubStatus(
        [
          match({
            matchId: 'r1',
            stageNumber: 2,
            round: 1,
            state: 'upcoming',
            scheduledAt: '2026-08-05T10:00:00Z',
          }),
          match({
            matchId: 'r2',
            stageNumber: 2,
            round: 2,
            state: 'upcoming',
            scheduledAt: '2026-08-08T10:00:00Z',
          }),
        ],
        club,
        stages,
      ),
    ).toEqual({
      kind: 'inCompetition',
      roundKind: 'round',
      roundNumber: 2,
    });
  });

  it('reports eliminated when latest finished knockout match was lost (including series ties)', () => {
    expect(
      deriveClubStatus(
        [
          match({
            matchId: 'qf',
            stageNumber: 2,
            nodeKey: 'SE-R1-M1',
            round: 1,
            sourceFinalRound: 3,
            zoneName: 'Copa Plata',
            state: 'final',
            homeScore: 1,
            awayScore: 1,
            series: {
              span: 2,
              games: [],
              homeGamesWon: 0,
              awayGamesWon: 1,
              status: 'decided',
              winner: 'away',
              explanation: 'decided',
            },
          }),
        ],
        club,
      ),
    ).toEqual({
      kind: 'eliminated',
      zone: 'Copa Plata',
      roundKind: 'quarterFinal',
      roundNumber: 1,
    });
  });

  it('reports inCompetition when latest finished knockout match was won', () => {
    expect(
      deriveClubStatus(
        [
          match({
            matchId: 'r1',
            stageNumber: 2,
            branch: 'winners',
            round: 1,
            state: 'final',
            homeScore: 4,
            awayScore: 2,
          }),
        ],
        club,
      ),
    ).toEqual({
      kind: 'inCompetition',
      roundKind: 'round',
      roundNumber: 1,
    });
  });
});

describe('deriveClubNextMatch and resolveClubNextOpponentName', () => {
  it('picks earliest live or upcoming match by scheduledAt and exposes live scores', () => {
    const next = deriveClubNextMatch(
      [
        match({ matchId: 'done', state: 'final', scheduledAt: '2026-08-01T10:00:00Z' }),
        match({
          matchId: 'later',
          state: 'upcoming',
          scheduledAt: '2026-08-05T18:00:00Z',
        }),
        match({
          matchId: 'live-now',
          state: 'live',
          scheduledAt: '2026-08-02T15:00:00Z',
          homeClubAlias: undefined,
          awayClubAlias: undefined,
          homeClubId: 'club-other',
          awayClubId: 'club-1',
          homeName: 'Murialdo',
          awayName: 'Club Hispano',
          awayScore: 2,
        }),
      ],
      club,
    );

    expect(next).toMatchObject({
      side: 'away',
      isLive: true,
      opponentName: 'Murialdo',
      homeScore: 0,
      awayScore: 2,
    });
    expect(next?.match.matchId).toBe('live-now');
  });

  it('orders scheduled matches before unscheduled and resolves pending opponent source', () => {
    const sideSource = sideSourceLabels(publicIntl('en'));
    const next = deriveClubNextMatch(
      [
        match({ matchId: 'unscheduled', state: 'upcoming', scheduledAt: undefined }),
        match({
          matchId: 'scheduled',
          state: 'upcoming',
          scheduledAt: '2026-08-03T12:00:00Z',
          awayName: undefined,
          awayClubAlias: undefined,
          awayClubId: undefined,
          awaySource: { kind: 'winner-of', matchNumber: 4 },
        }),
      ],
      club,
    );

    if (!next) throw new Error('expected next match');
    expect(next.match.matchId).toBe('scheduled');
    expect(resolveClubNextOpponentName(next, sideSource)).toBe('Winner of Match 4');
    expect(resolveClubNextOpponentName({ ...next, opponentName: 'Rivadavia' }, sideSource)).toBe(
      'Rivadavia',
    );
    expect(
      resolveClubNextOpponentName(
        { ...next, opponentName: undefined, opponentSource: undefined },
        sideSource,
      ),
    ).toBe(sideSource.unknown);
    expect(deriveClubNextMatch([match({ state: 'final' })], club)).toBeUndefined();
  });
});

describe('deriveClubResults', () => {
  it('lists finished matches in chronological order with outcomes', () => {
    const results = deriveClubResults(
      [
        match({
          matchId: 'm2',
          stageNumber: 1,
          matchNumber: 2,
          stageName: 'Group Stage',
          zoneName: 'Zone 1',
          groupName: 'Group A',
          round: 2,
          nodeKey: 'GRP-1',
          sourceFinalRound: 3,
          venueName: 'Court 1',
          state: 'final',
          scheduledAt: '2026-08-04T18:00:00Z',
          homeClubAlias: 'andes-talleres',
          homeName: 'Andes Talleres',
          homeAbbreviation: 'AND',
          homeClubId: 'club-2',
          homeEmblemObjectId: 'emb-2',
          awayClubAlias: 'club-hispano',
          awayName: 'Club Hispano',
          homeScore: 2,
          awayScore: 2,
        }),
        match({
          matchId: 'm1',
          stageNumber: 1,
          matchNumber: 1,
          state: 'final',
          scheduledAt: '2026-08-01T18:00:00Z',
          awayAbbreviation: undefined,
          awayClubId: undefined,
          awayEmblemObjectId: undefined,
          awayClubAlias: undefined,
          awayName: undefined,
          homeScore: 3,
          awayScore: 1,
        }),
        match({ matchId: 'm3', state: 'upcoming' }),
      ],
      club,
    );

    expect(results.map((r) => [r.matchId, r.outcome, r.ownScore, r.opponentScore])).toEqual([
      ['m1', 'won', 3, 1],
      ['m2', 'drawn', 2, 2],
    ]);
    expect(results[1]?.opponentClubAlias).toBe('andes-talleres');
    expect(results[1]?.groupName).toBe('Group A');
  });
});

describe('deriveClubSquad', () => {
  const baseProjection: TableProjectionResponse = {
    layoutCode: 'player-stats',
    target: 'player-ranking',
    label: 'Players',
    projectionVersion: 1,
    grain: 'match',
    columns: [
      { code: 'rank', header: '#', format: 'number' },
      { code: 'player', header: 'Player', format: 'text' },
      { code: 'player-appearances', header: 'PJ', format: 'number' },
      { code: 'goals', header: 'G', format: 'number', zeroDisplay: '0' },
    ],
    defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
    rows: [
      {
        rank: 1,
        sharedRank: false,
        actorId: 'p-hidden',
        actorName: 'Secret Name',
        shirtNumber: 9,
        nationality: 'AR',
        hiddenAtRequest: true,
        clubId: 'club-1',
        clubAlias: 'club-hispano',
        cells: {
          'player-appearances': { raw: 4, formatted: '4' },
          goals: { raw: 3, formatted: '3' },
        },
      },
      {
        rank: 2,
        sharedRank: false,
        actorId: 'p-10',
        actorName: 'Zoe Perez',
        shirtNumber: 10,
        clubId: 'club-1',
        clubAlias: 'club-hispano',
        cells: {
          'player-appearances': { raw: 5, formatted: '5' },
          goals: { raw: 0, formatted: '' },
        },
      },
      {
        rank: 3,
        sharedRank: false,
        actorId: 'p-2',
        actorName: 'Ana Gomez',
        shirtNumber: 2,
        publicProfileAvailable: false,
        clubId: 'club-1',
        clubAlias: 'club-hispano',
        cells: {
          'player-appearances': { raw: 5, formatted: '5' },
          goals: { raw: 1, formatted: '1' },
        },
      },
      {
        rank: 4,
        sharedRank: false,
        actorId: 'p-none',
        actorName: 'Bruno Diaz',
        clubId: 'club-1',
        clubAlias: 'club-hispano',
        cells: {},
      },
      {
        rank: 5,
        sharedRank: false,
        actorId: 'p-other',
        actorName: 'Other Club Player',
        shirtNumber: 1,
        clubId: 'club-2',
        clubAlias: 'andes-talleres',
        cells: {},
      },
    ],
  };

  it('returns empty when projection is undefined and handles squad sorting and redaction', () => {
    expect(deriveClubSquad(undefined, club)).toEqual({ members: [] });

    const squad = deriveClubSquad(baseProjection, club, {
      hiddenPlayerLabel: 'Hidden player',
    });
    expect(squad.appearancesColumn?.code).toBe('player-appearances');
    expect(squad.primaryStatColumn?.code).toBe('goals');
    expect(squad.members.map((m) => [m.displayName, m.shirtNumber, m.profileAvailable])).toEqual([
      ['Ana Gomez', 2, false],
      ['Zoe Perez', 10, true],
      ['Bruno Diaz', undefined, true],
      ['Hidden player', undefined, false],
    ]);
    expect(squad.members[1]?.primaryStat).toBe('0');
    expect(squad.members[2]?.appearances).toBe('0');
    expect(squad.members[3]?.actorId).toBeUndefined();
  });

  it('falls back to the first numeric column when defaultSort names an identity column', () => {
    const squad = deriveClubSquad(
      {
        ...baseProjection,
        columns: [
          { code: 'name', header: 'Name', format: 'text' },
          { code: 'assists', header: 'A', format: 'number' },
        ],
        defaultSort: [{ columnCode: 'name', direction: 'asc' }],
        rows: [
          {
            rank: 1,
            sharedRank: false,
            actorId: 'p-1',
            actorName: 'Leo',
            shirtNumber: 'A',
            clubId: 'club-1',
            cells: { name: { formatted: 'Leo' }, assists: { raw: 2, formatted: '2' } },
          },
          {
            rank: 2,
            sharedRank: false,
            actorId: 'p-2',
            actorName: 'Max',
            shirtNumber: '7',
            clubId: 'club-1',
            cells: { name: { formatted: 'Max' }, assists: { raw: 4, formatted: '4' } },
          },
        ],
      },
      club,
    );

    expect(squad.primaryStatColumn?.code).toBe('assists');
    expect(squad.members.map((m) => m.displayName)).toEqual(['Max', 'Leo']);
  });
});

describe('deriveClubKnockoutPath', () => {
  it('extracts latest knockout stage matches in round order with zone anchor', () => {
    expect(deriveClubKnockoutPath([match({ state: 'upcoming' })], club)).toBeUndefined();

    const path = deriveClubKnockoutPath(
      [
        match({
          matchId: 'sf',
          stageNumber: 2,
          matchNumber: 5,
          nodeKey: 'SE-R2-M1',
          round: 2,
          sourceFinalRound: 3,
          zoneName: 'Copa de Oro',
          state: 'final',
          homeScore: 2,
          awayScore: 1,
        }),
        match({
          matchId: 'f',
          stageNumber: 2,
          matchNumber: 7,
          nodeKey: 'SE-R3-M1',
          round: 3,
          sourceFinalRound: 3,
          zoneName: 'Copa de Oro',
          state: 'upcoming',
        }),
      ],
      club,
    );

    expect(path?.stageNumber).toBe(2);
    expect(path?.zoneAnchor).toBe('copa-de-oro');
    expect(path?.matches.map((m) => [m.roundKind, m.outcome])).toEqual([
      ['semiFinal', 'won'],
      ['final', undefined],
    ]);
  });
});

describe('resolveClubFilter', () => {
  const clubs = [
    { clubId: 'club-1', name: 'Hispano', alias: 'club-hispano' },
    { clubId: 'club-2', name: 'Legacy Club' },
  ];

  it('prefers ?club= over ?clubId=, redirects ?clubId= for aliased clubs, and preserves non-aliased ?clubId=', () => {
    expect(
      resolveClubFilter(new URLSearchParams('club=club-hispano&clubId=club-2'), clubs),
    ).toEqual({
      activeClubAlias: 'club-hispano',
      activeClubId: 'club-1',
    });

    expect(resolveClubFilter(new URLSearchParams('tab=standings&clubId=club-1'), clubs)).toEqual({
      redirectSearch: 'tab=standings&club=club-hispano',
    });

    expect(resolveClubFilter(new URLSearchParams('clubId=club-2'), clubs)).toEqual({
      activeClubId: 'club-2',
    });

    expect(resolveClubFilter(new URLSearchParams(''), clubs)).toEqual({});
  });
});
