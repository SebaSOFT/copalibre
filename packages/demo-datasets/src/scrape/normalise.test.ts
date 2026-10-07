import { PANAMERICANO_CLUBES_2025 } from './config.js';
import { normalise, type NormaliseInput } from './normalise.js';
import type { RawGame } from './parse-calendar.js';
import type { RawGoal, RawReport, RawSheetRow } from './parse-report.js';
import type { RawPlayer } from './parse-roster.js';
import type { RawTeam } from './parse-teams.js';
import { validateDatasetDocument } from '../validate.js';

const POOL = [
  'Alba',
  'Bravo',
  'Cano',
  'Duran',
  'Egea',
  'Farias',
  'Gil',
  'Haro',
  'Ibarra',
  'Jara',
  'Lara',
  'Mena',
];

const GIVEN_POOL = ['Ines', 'Julio', 'Karen', 'Lidia', 'Mario', 'Nora', 'Omar', 'Pilar'];

const TEAMS: RawTeam[] = [
  { teamId: '1', logoFile: '1.png', abbreviation: 'UNO', name: 'CLUB UNO' },
  { teamId: '2', logoFile: '2.png', abbreviation: 'DOS', name: 'CLUB DOS' },
  { teamId: '3', logoFile: '3.png', abbreviation: 'TRE', name: 'CLUB TRES' },
];

function player(id: string, team: string, fullName: string, goals = 0): RawPlayer {
  return { playerId: id, teamId: team, fullName, nationality: 'AR', goals, assists: 0 };
}

const ROSTER: RawPlayer[] = [
  player('11', '1', 'ZZREALONE , MARTIN ANDRES', 2),
  player('12', '1', 'ZZREALTWO , IVAN'),
  player('21', '2', 'ZZREALTHREE , JOAQUIN', 1),
  player('22', '2', 'ZZREALFOUR MEDIRA , LUIS'),
];

function game(overrides: Partial<RawGame>): RawGame {
  return {
    gameId: '100',
    phaseId: '279',
    phaseName: 'Grupo A',
    round: 'Jornada 1',
    date: '02/11/2025',
    time: '9:30',
    venue: 'Aldo Cantoni',
    homeLogoFile: '1.png',
    awayLogoFile: '2.png',
    homeName: 'CLUB UNO',
    awayName: 'CLUB DOS',
    homeGoals: 2,
    awayGoals: 1,
    note: undefined,
    ...overrides,
  };
}

function goal(overrides: Partial<RawGoal>): RawGoal {
  return {
    period: 'P1',
    clock: '10:00',
    teamLogoFile: '1.png',
    playerId: '11',
    scorerName: { surname: 'ZZREALONE', givenNames: 'MARTIN ANDRES' },
    teamId: '1',
    detail: '',
    ...overrides,
  };
}

function row(overrides: Partial<RawSheetRow>): RawSheetRow {
  return {
    dorsal: 7,
    goalkeeper: false,
    captain: false,
    name: { surname: 'ZZREALONE', givenNames: 'MARTIN ANDRES' },
    goals: 0,
    assists: 0,
    ...overrides,
  };
}

function report(overrides: Partial<RawReport> = {}): RawReport {
  return {
    homeGoals: 2,
    awayGoals: 1,
    roundNumber: 1,
    referees: [{ surname: 'ZZREFEREE', givenNames: 'ANA MARIA' }],
    goals: [
      goal({ clock: '05:00', playerId: '11' }),
      goal({ period: 'P2', clock: '20:00', playerId: '11', detail: 'falta directa' }),
      goal({
        teamLogoFile: '2.png',
        teamId: '2',
        playerId: '21',
        clock: '12:00',
        period: 'P1',
        scorerName: { surname: 'ZZREALTHREE', givenNames: 'JOAQUIN' },
      }),
    ],
    homeSheet: [
      row({ dorsal: 7, captain: true }),
      row({ dorsal: 7 }),
      row({ dorsal: 9, name: { surname: 'ZZREALTWO', givenNames: 'IVAN' }, goalkeeper: true }),
    ],
    awaySheet: [
      row({ dorsal: 4, name: { surname: 'ZZREALFOUR', givenNames: 'LUIS' } }),
      row({ dorsal: 99, name: { surname: 'NOBODY', givenNames: 'KNOWN' } }),
    ],
    ...overrides,
  };
}

function input(overrides: Partial<NormaliseInput> = {}): NormaliseInput {
  return {
    config: PANAMERICANO_CLUBES_2025,
    teams: TEAMS,
    games: [game({})],
    reports: new Map([['100', report()]]),
    roster: ROSTER,
    pool: POOL,
    givenNamePool: GIVEN_POOL,
    ...overrides,
  };
}

describe('normalise', () => {
  it('builds a valid dataset with clubs, teams, phases, venues and a scheduled game', async () => {
    const { dataset, clubLogos } = normalise(input());
    expect(await validateDatasetDocument(dataset)).toEqual([]);
    expect(dataset.clubs.map((club) => [club.alias, club.emblem])).toEqual([
      ['club-dos', 'emblems/clubs/club-dos.png'],
      ['club-tres', 'emblems/clubs/club-tres.png'],
      ['club-uno', 'emblems/clubs/club-uno.png'],
    ]);
    expect(clubLogos.get('club-uno')).toBe('1.png');
    expect(dataset.phases).toEqual([
      { alias: 'grupo-a', name: 'Grupo A', kind: 'group', teamAliases: ['club-dos', 'club-uno'] },
    ]);
    expect(dataset.venues).toEqual([{ alias: 'aldo-cantoni', name: 'Aldo Cantoni' }]);
    expect(dataset.games[0]).toMatchObject({
      key: 'game-100',
      phaseAlias: 'grupo-a',
      roundNumber: 1,
      scheduledAt: '2025-11-02T09:30',
      venueAlias: 'aldo-cantoni',
      homeTeamAlias: 'club-uno',
      awayTeamAlias: 'club-dos',
      scorerKnown: true,
    });
    expect(dataset.tournament.emblem).toBe('emblems/tournament.png');
  });

  it('keeps given names, replaces surnames, and leaks no real surname anywhere', () => {
    const { dataset } = normalise(input());
    const text = JSON.stringify(dataset).toLowerCase();
    for (const real of [
      'zzrealone',
      'zzrealtwo',
      'zzrealthree',
      'zzrealfour',
      'zzreferee',
      'medira',
    ]) {
      expect(text).not.toContain(real);
    }
    const martin = dataset.players.find((candidate) => candidate.givenNames === 'Martin Andres');
    expect(martin).toBeDefined();
    expect(POOL).toContain(martin?.surname);
    expect(martin?.alias).toBe(`martin-andres-${martin?.surname.toLowerCase()}`);
    const referee = dataset.games[0]?.officials[0];
    expect(GIVEN_POOL).toContain(referee?.givenNames);
    expect(POOL).toContain(referee?.surname);
    expect(text).not.toContain('ana maria');
  });

  it('is deterministic and independent of roster order', () => {
    const first = normalise(input()).dataset;
    const second = normalise(input({ roster: [...ROSTER].reverse() })).dataset;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('gives distinct surnames to distinct people, including referees', () => {
    const { dataset } = normalise(input());
    const surnames = [
      ...dataset.players.map((candidate) => candidate.surname),
      ...dataset.games.flatMap((candidate) =>
        candidate.officials.map((official) => official.surname),
      ),
    ];
    expect(new Set(surnames).size).toBe(surnames.length);
  });

  it('takes dorsal, goalkeeper and captain from the sheets and matches near names', () => {
    const { dataset } = normalise(input());
    const find = (givenNames: string) =>
      dataset.players.find((candidate) => candidate.givenNames === givenNames);
    expect(find('Martin Andres')).toMatchObject({
      dorsal: 7,
      roles: ['captain'],
      nationality: 'AR',
      goals: 2,
    });
    expect(find('Ivan')).toMatchObject({ dorsal: 9, roles: ['goalkeeper'] });
    expect(find('Luis')).toMatchObject({ dorsal: 4 });
    expect(find('Known')).toBeUndefined();
  });

  it('records goal events in playing order with the scorer and detail', () => {
    const { dataset } = normalise(input());
    expect(
      dataset.games[0]?.events.map((event) => [event.period, event.clock, event.detail]),
    ).toEqual([
      ['P1', '12:00', undefined],
      ['P1', '05:00', undefined],
      ['P2', '20:00', 'falta directa'],
    ]);
  });

  it('adds a scorer the roster lacks, with a warning', () => {
    const missing = report({
      goals: [
        goal({ playerId: '77', scorerName: { surname: 'ZZEXTRA', givenNames: 'NICO' } }),
        goal({
          playerId: '77',
          clock: '02:00',
          scorerName: { surname: 'ZZEXTRA', givenNames: 'NICO' },
        }),
        goal({ teamLogoFile: '2.png', teamId: '2', playerId: '21' }),
      ],
    });
    const result = normalise(input({ reports: new Map([['100', missing]]) }));
    expect(result.warnings).toEqual([
      'scorer 77 is missing from the roster; added from the goal row',
    ]);
    expect(result.dataset.players.some((candidate) => candidate.givenNames === 'Nico')).toBe(true);
    expect(JSON.stringify(result.dataset).toLowerCase()).not.toContain('zzextra');
  });

  it('drops scorers when the events disagree with the official score, and says why', () => {
    const result = normalise(
      input({
        games: [game({ note: 'RESULTADO PARTIDO 4-1 REGLAMENTO 2-1' })],
        reports: new Map([['100', report({ goals: [goal({})] })]]),
      }),
    );
    expect(result.dataset.games[0]).toMatchObject({
      scorerKnown: false,
      events: [],
      homeGoals: 2,
      awayGoals: 1,
    });
    expect(result.warnings[0]).toContain('REGLAMENTO 2-1');
  });

  it('keeps the score of a game whose report could not be fetched', () => {
    const result = normalise(input({ reports: new Map() }));
    expect(result.dataset.games[0]).toMatchObject({
      scorerKnown: false,
      events: [],
      officials: [],
      roundNumber: 1,
    });
    expect(result.warnings).toEqual(['game 100: no report; score kept, no scorers']);
  });

  it('numbers cup rounds by date, not by the portal numbering', () => {
    const cup = (id: string, round: string, date: string) =>
      game({ gameId: id, phaseName: 'Copa Oro', round, date, venue: 'Social' });
    const { dataset } = normalise(
      input({
        games: [
          cup('1', 'Final', '08/11/2025'),
          cup('2', 'Semi finales', '07/11/2025'),
          cup('3', 'Cuartos de final', '05/11/2025'),
          cup('4', 'Cuartos de final', '06/11/2025'),
        ],
        reports: new Map(),
      }),
    );
    expect(dataset.games.map((candidate) => [candidate.round, candidate.roundNumber])).toEqual([
      ['Final', 3],
      ['Semi finales', 2],
      ['Cuartos de final', 1],
      ['Cuartos de final', 1],
    ]);
    expect(dataset.phases[0]).toMatchObject({ kind: 'cup', alias: 'copa-oro' });
  });

  it('puts groups before cups and sorts venues', () => {
    const { dataset } = normalise(
      input({
        games: [
          game({ gameId: '1', phaseName: 'Copa Oro', round: 'Final', venue: 'Social' }),
          game({ gameId: '2', phaseName: 'Grupo B', venue: 'Olimpia' }),
        ],
        reports: new Map(),
      }),
    );
    expect(dataset.phases.map((phase) => phase.alias)).toEqual(['grupo-b', 'copa-oro']);
    expect(dataset.venues.map((venue) => venue.alias)).toEqual(['olimpia', 'social']);
  });

  it('disambiguates clubs and players that would share an alias', () => {
    const teams: RawTeam[] = [
      { teamId: '1', logoFile: '1.png', abbreviation: 'AAA', name: 'SAN JORGE' },
      { teamId: '2', logoFile: '2.png', abbreviation: 'BBB', name: 'San Jorge' },
    ];
    const roster = [player('1', '1', 'ONE , SAME NAME'), player('2', '1', 'TWO , SAME NAME')];
    const clash = normalise(
      input({ teams, roster, games: [], reports: new Map(), pool: ['Alba'].concat(POOL) }),
    );
    expect(clash.dataset.clubs.map((club) => club.alias)).toEqual(['san-jorge', 'san-jorge-bbb']);
    const aliases = clash.dataset.players.map((candidate) => candidate.alias);
    expect(new Set(aliases).size).toBe(2);
  });

  it('skips roster players on unknown teams and fails on impossible games', () => {
    const stray = normalise(
      input({
        roster: [...ROSTER, player('99', '404', 'LOST , PLAYER')],
        games: [],
        reports: new Map(),
      }),
    );
    expect(stray.warnings).toEqual(['roster player 99 is on an unknown team 404']);
    expect(() => normalise(input({ games: [game({ homeLogoFile: 'x.png' })] }))).toThrow(
      'missing from the team list',
    );
    expect(() => normalise(input({ games: [game({ homeGoals: undefined })] }))).toThrow(
      'has no score',
    );
  });

  it('ignores goals whose team or scorer is unknown and replaces an official with no given name', () => {
    const odd = report({
      referees: [{ surname: 'ONLYSURNAME', givenNames: '' }],
      goals: [
        goal({ teamId: '404' }),
        goal({ playerId: '11' }),
        goal({ playerId: '11', clock: '01:00' }),
        goal({ teamLogoFile: '2.png', teamId: '2', playerId: '21' }),
      ],
    });
    const { dataset } = normalise(input({ reports: new Map([['100', odd]]) }));
    expect(dataset.games[0]?.officials).toHaveLength(1);
    expect(JSON.stringify(dataset).toLowerCase()).not.toContain('onlysurname');
    expect(dataset.games[0]?.events).toHaveLength(3);
  });

  it('copes with a player who has no given names, no sheet rows, and a game with no venue', async () => {
    const roster = [
      player('5', '1', 'ZZLONER'),
      { ...player('6', '1', 'ZZAMBIG ONE , SAM'), nationality: undefined },
      player('7', '1', 'ZZAMBIG TWO , SAM'),
    ];
    const rows = report({
      homeSheet: [
        row({ dorsal: undefined, name: { surname: 'ZZAMBIG', givenNames: 'SAM' } }),
        row({ dorsal: 3, name: { surname: 'ZZAMBIG ONE', givenNames: 'SAM' } }),
      ],
      awaySheet: [],
    });
    const { dataset } = normalise(
      input({ roster, games: [game({ venue: '' })], reports: new Map([['100', rows]]) }),
    );
    expect(await validateDatasetDocument(dataset)).toEqual([]);
    expect(dataset.games[0]?.venueAlias).toBeUndefined();
    expect(dataset.venues).toEqual([]);
    const loner = dataset.players.find((candidate) => candidate.givenNames === 'Jugador');
    expect(loner).toBeDefined();
    expect(loner?.dorsal).toBeUndefined();
    const sams = dataset.players.filter((candidate) => candidate.givenNames === 'Sam');
    expect(sams.map((candidate) => candidate.dorsal)).toEqual(
      expect.arrayContaining([3, undefined]),
    );
    expect(sams.find((candidate) => candidate.nationality === undefined)).toBeDefined();
  });

  it('lists an official once when the sheet prints them twice', () => {
    const twice = report({
      referees: [
        { surname: 'ZZREFEREE', givenNames: 'ANA MARIA' },
        { surname: 'ZZREFEREE', givenNames: 'ana maria' },
        { surname: 'ZZOTHER', givenNames: 'LUIS' },
      ],
    });
    const { dataset } = normalise(input({ reports: new Map([['100', twice]]) }));
    expect(dataset.games[0]?.officials).toHaveLength(2);
  });
});
