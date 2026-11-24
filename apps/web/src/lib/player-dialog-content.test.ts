import type { PlayerStatisticsDrilldownResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import {
  buildPlayerDialogContent,
  extractDialogTournamentTotals,
  playerDialogMessage,
  type PlayerDialogLabels,
  type PlayerDialogProfile,
} from './player-dialog-content.js';

const labels: PlayerDialogLabels = {
  locale: 'en',
  roles: {},
  fallbackTitle: 'Player',
  loadingPlaceholder: 'Loading details',
  loadingFetch: 'Loading',
  careerStatisticsHeading: 'Career',
  competitionHistoryHeading: 'History',
  columnTournament: 'Tournament',
  columnTeam: 'Team',
  columnRole: 'Role',
  noCareerStatistics: 'No statistics',
  noCompetitionHistory: 'No history',
  loadError: 'Failed',
};

const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '<script>alert(1)</script>',
  '"><svg onload=alert(1)>',
  "' onmouseover='alert(1)",
  '</td></tr></table><iframe src=javascript:alert(1)></iframe>',
  '&lt;b&gt;encoded&lt;/b&gt;',
];

function build(profile: PlayerDialogProfile): HTMLElement {
  return buildPlayerDialogContent(document, profile, labels);
}

describe('the player dialog content', () => {
  it.each(PAYLOADS)('keeps %s as text in every field', (payload) => {
    const content = build({
      nationality: payload,
      careerStatistics: [{ statistics: [{ label: payload, value: 3 }] }],
      competitionHistory: [
        {
          tournamentName: payload,
          teamName: payload,
          role: payload,
          entrantAbbreviation: payload,
        },
      ],
    });

    expect(content.querySelector('img, script, svg, iframe, b')).toBeNull();
    expect(content.querySelector('.cl-player-profile__tag')?.textContent).toBe(payload);
    expect(content.querySelector('.cl-stat-label')?.textContent).toBe(payload);
    const cells = [...content.querySelectorAll('tbody td')].map((cell) => cell.textContent);
    expect(cells).toEqual([payload, `${payload} (${payload})`, payload]);
    expect(content.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('keeps the sections and classes of an ordinary profile', () => {
    const content = build({
      nationality: 'AR',
      age: 28,
      careerStatistics: [
        { statistics: [{ label: 'Goals', value: 7 }] },
        { statistics: [{ label: 'Assists', value: 2 }] },
        {},
      ],
      competitionHistory: [{ tournamentName: 'Copa', teamName: 'Casa de Italia', role: 'player' }],
    });

    expect(content.className).toBe('cl-modal-profile');
    expect(
      [...content.querySelectorAll('.cl-player-profile__tag')].map((tag) => tag.textContent),
    ).toEqual(['AR', 'Age: 28']);
    expect(
      [...content.querySelectorAll('.cl-modal-section-title')].map((title) => title.textContent),
    ).toEqual(['Career', 'History']);
    expect(content.querySelectorAll('.cl-modal-stats-grid .cl-stat-item')).toHaveLength(2);
    expect(content.querySelector('.cl-stat-val')?.textContent).toBe('7');
    // These sit inline, so the space between them is what keeps them apart.
    expect(content.querySelector('.cl-modal-meta')?.textContent).toBe('AR Age: 28');
    expect(content.querySelector('.cl-stat-item')?.textContent).toBe('Goals 7');
    expect([...content.querySelectorAll('th')].map((header) => header.textContent)).toEqual([
      'Tournament',
      'Team',
      'Role',
    ]);
    expect(content.querySelector('.cl-modal-history-table td strong')?.textContent).toBe('Copa');
    expect(content.querySelectorAll('tbody td')[1]?.textContent).toBe('Casa de Italia');
  });

  it('states an absence and leaves out empty metadata', () => {
    const content = build({});

    expect(content.querySelector('.cl-modal-meta')).toBeNull();
    expect(content.querySelector('table')).toBeNull();
    expect(
      [...content.querySelectorAll('.cl-modal-empty')].map((empty) => empty.textContent),
    ).toEqual(['No statistics', 'No history']);
  });

  it('shows an age of zero and an empty role without inventing text', () => {
    const content = build({
      age: 0,
      competitionHistory: [{ tournamentName: 'Copa', teamName: 'Casa de Italia' }],
    });

    expect(content.querySelector('.cl-player-profile__tag')?.textContent).toBe('Age: 0');
    expect(content.querySelectorAll('tbody td')[2]?.textContent).toBe('');
  });

  it('shows statistic labels in the page language, falling back to the stored label', () => {
    const spanish: PlayerDialogLabels = {
      ...labels,
      locale: 'es',
      roles: { player: 'Jugador' },
    };
    const content = buildPlayerDialogContent(
      document,
      {
        careerStatistics: [
          {
            statistics: [
              { label: 'Goals', localizedLabel: { en: 'Goals', es: 'Goles' }, value: 10 },
              { label: 'Appearances', value: 4 },
            ],
          },
        ],
        competitionHistory: [{ tournamentName: 'Copa', teamName: 'Casa', role: 'player' }],
      },
      spanish,
    );

    expect([...content.querySelectorAll('.cl-stat-item')].map((item) => item.textContent)).toEqual([
      'Goles 10',
      'Appearances 4',
    ]);
    expect(content.querySelector('tbody td:nth-child(3)')?.textContent).toBe('Jugador');
  });

  it('shows a role the catalogue does not name as stored', () => {
    const content = buildPlayerDialogContent(
      document,
      { competitionHistory: [{ tournamentName: 'Copa', teamName: 'Casa', role: 'referee' }] },
      { ...labels, locale: 'es', roles: { player: 'Jugador' } },
    );

    expect(content.querySelector('tbody td:nth-child(3)')?.textContent).toBe('referee');
  });

  it('writes a status message as text', () => {
    const message = playerDialogMessage(document, 'cl-inline-alert', '<b>Failed</b>');

    expect(message.className).toBe('cl-inline-alert');
    expect(message.querySelector('b')).toBeNull();
    expect(message.textContent).toBe('<b>Failed</b>');
  });

  it('shows current tournament club, shirt number, tournament totals, and view profile link', () => {
    const fullLabels: PlayerDialogLabels = {
      ...labels,
      locale: 'es',
      viewProfile: 'Ver perfil',
      shirtNumberTemplate: '#{number}',
      clubLabelTemplate: 'Club: {club}',
      ageTemplate: 'Edad: {age}',
      tournamentTotalsHeading: 'Total del Torneo',
    };
    const content = buildPlayerDialogContent(
      document,
      {
        nationality: 'AR',
        age: 24,
        competitionHistory: [
          {
            tournamentName: 'Panamericano 2025',
            tournamentAlias: 'panamericano-2025',
            teamName: 'Club Hispano',
            entrantAbbreviation: 'HIS',
            shirtNumber: 3,
            role: 'player',
          },
        ],
      },
      fullLabels,
      {
        tournamentAlias: 'panamericano-2025',
        profileHref: '/es/org/tournaments/panamericano-2025/players/p1?layout=player-stats',
        tournamentTotals: [
          { label: 'Partidos jugados', value: '4' },
          { label: 'Goles', value: '10' },
        ],
      },
    );

    expect(
      [...content.querySelectorAll('.cl-player-profile__tag')].map((tag) => tag.textContent),
    ).toEqual(['Club: Club Hispano (HIS)', '#3', 'AR', 'Edad: 24']);
    expect(content.querySelector('.cl-modal-tournament-totals__line')?.textContent).toBe(
      'Partidos jugados: 4 · Goles: 10',
    );
    const link = content.querySelector<HTMLAnchorElement>('.cl-player-dialog__profile-link');
    expect(link?.textContent).toBe('Ver perfil');
    expect(link?.getAttribute('href')).toBe(
      '/es/org/tournaments/panamericano-2025/players/p1?layout=player-stats',
    );
  });

  it('keeps club, shirt number, and tournament totals safe as text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const content = buildPlayerDialogContent(
      document,
      {
        competitionHistory: [
          {
            tournamentName: 'Copa',
            tournamentAlias: 'copa',
            teamName: payload,
            shirtNumber: payload,
          },
        ],
      },
      { ...labels, viewProfile: 'View profile', tournamentTotalsHeading: 'Totals' },
      {
        tournamentAlias: 'copa',
        profileHref: '/org/tournaments/copa/players/p1?layout=top-scorers',
        tournamentTotals: [{ label: payload, value: payload }],
      },
    );

    expect(content.querySelector('img')).toBeNull();
    expect(content.querySelector('.cl-modal-meta')?.textContent).toContain(payload);
    expect(content.querySelector('.cl-modal-tournament-totals__line')?.textContent).toBe(
      `${payload}: ${payload}`,
    );
  });
});

describe('extractDialogTournamentTotals', () => {
  it('picks the first two collector columns from the drilldown response', () => {
    const statistics: PlayerStatisticsDrilldownResponse = {
      layoutCode: 'player-stats',
      label: { en: 'Player Stats', es: 'Estadísticas' },
      columns: [
        { code: 'played', header: { en: 'Played', es: 'Partidos jugados' }, format: 'number' },
        { code: 'goals', header: { en: 'Goals', es: 'Goles' }, format: 'number' },
        { code: 'assists', header: { en: 'Assists', es: 'Asistencias' }, format: 'number' },
        { code: 'gpp', header: 'Gpp', format: 'decimal-2' },
      ],
      tournamentTotal: {
        played: { raw: 4, formatted: '4' },
        goals: { raw: 10, formatted: '10' },
        assists: { raw: 3, formatted: '3' },
        gpp: { raw: 2.5, formatted: '2.50' },
      },
      matches: [
        {
          stageNumber: 1,
          matchNumber: 1,
          side: 'home',
          opponentName: 'Lomas',
          cells: {
            played: { raw: 1, formatted: '1' },
            goals: { raw: 2, formatted: '2' },
            assists: { raw: 1, formatted: '1' },
          },
        },
      ],
    };

    expect(extractDialogTournamentTotals(statistics, 'es', 2)).toEqual([
      { label: 'Partidos jugados', value: '4' },
      { label: 'Goles', value: '10' },
    ]);
  });

  it('returns an empty list when tournamentTotal is absent', () => {
    expect(extractDialogTournamentTotals(undefined, 'en')).toEqual([]);
  });
});
