import type { PublicPersonCompetitionHistoryResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import type { MatchCardData } from './matches-view.js';
import { publicIntl, sideSourceLabels } from './i18n/public-intl.js';
import {
  currentTournamentHistoryEntry,
  findPlayerNextMatch,
  formatPlayerMatchRowLabel,
  formatPlayerStatCell,
  resolveNextMatchOpponent,
} from './player-profile.js';

const match = (overrides: Partial<MatchCardData> = {}): MatchCardData => ({
  matchId: 'm1',
  stageNumber: 1,
  matchNumber: 1,
  state: 'upcoming',
  ...overrides,
});

describe('currentTournamentHistoryEntry', () => {
  const history: readonly PublicPersonCompetitionHistoryResponse[] = [
    {
      tournamentId: 't1',
      tournamentName: 'Cup A',
      tournamentAlias: 'cup-a',
      teamId: 'team-1',
      teamName: 'Club Hispano',
      role: 'player',
      shirtNumber: 3,
      disciplineDescriptorId: 'rink-hockey',
      disciplineDescriptorVersion: '1',
    },
  ];

  it('finds the entry matching the current tournament alias', () => {
    expect(currentTournamentHistoryEntry(history, 'cup-a')?.teamName).toBe('Club Hispano');
    expect(currentTournamentHistoryEntry(history, 'cup-b')).toBeUndefined();
    expect(currentTournamentHistoryEntry(history, undefined)).toBeUndefined();
  });
});

describe('findPlayerNextMatch', () => {
  const entrantId = 'entrant-hispano';

  it('picks the earliest live or upcoming match for the entrant by scheduledAt', () => {
    const finished = match({
      matchId: 'm-final',
      state: 'final',
      homeEntrantId: entrantId,
      awayEntrantId: 'opp-0',
      scheduledAt: '2026-11-01T18:00:00.000Z',
    });
    const laterUpcoming = match({
      matchId: 'm-later',
      stageNumber: 2,
      matchNumber: 2,
      state: 'upcoming',
      homeEntrantId: 'opp-2',
      awayEntrantId: entrantId,
      scheduledAt: '2026-11-10T20:00:00.000Z',
    });
    const nextUpcoming = match({
      matchId: 'm-next',
      stageNumber: 2,
      matchNumber: 1,
      state: 'upcoming',
      homeEntrantId: entrantId,
      awayEntrantId: 'opp-1',
      scheduledAt: '2026-11-08T18:00:00.000Z',
    });
    const otherClub = match({
      matchId: 'm-other',
      state: 'upcoming',
      homeEntrantId: 'opp-1',
      awayEntrantId: 'opp-2',
      scheduledAt: '2026-11-05T18:00:00.000Z',
    });

    const found = findPlayerNextMatch(
      [finished, laterUpcoming, otherClub, nextUpcoming],
      entrantId,
    );
    expect(found?.match.matchId).toBe('m-next');
    expect(found?.side).toBe('home');
  });

  it('places scheduled matches ahead of unscheduled ones and breaks unscheduled ties by live state', () => {
    const unscheduledLive = match({
      matchId: 'm-live',
      state: 'live',
      homeEntrantId: 'opp-1',
      awayEntrantId: entrantId,
    });
    const unscheduledUpcoming = match({
      matchId: 'm-up',
      state: 'upcoming',
      homeEntrantId: entrantId,
      awayEntrantId: 'opp-2',
    });
    expect(findPlayerNextMatch([unscheduledUpcoming, unscheduledLive], entrantId)).toEqual({
      match: unscheduledLive,
      side: 'away',
    });
  });

  it('returns undefined when no live or upcoming match includes the entrant', () => {
    const finished = match({
      state: 'final',
      homeEntrantId: entrantId,
      awayEntrantId: 'opp-1',
    });
    expect(findPlayerNextMatch([finished], entrantId)).toBeUndefined();
  });
});

describe('resolveNextMatchOpponent', () => {
  const sideSource = sideSourceLabels(publicIntl('es'));

  it('returns the decided opponent name when present', () => {
    const m = match({ homeName: 'Club Hispano', awayName: 'Lomas de Rivadavia' });
    expect(resolveNextMatchOpponent(m, 'home', sideSource)).toBe('Lomas de Rivadavia');
    expect(resolveNextMatchOpponent(m, 'away', sideSource)).toBe('Club Hispano');
  });

  it('formats the undecided side source when the opponent is not yet known', () => {
    const m = match({
      homeName: 'Club Hispano',
      awaySource: { kind: 'winner-of', nodeKey: 'SE-R1-M2', round: 1, position: 2 },
    });
    expect(resolveNextMatchOpponent(m, 'home', sideSource)).toContain('Ronda 1');
  });

  it('falls back to unknown when neither name nor source is available', () => {
    expect(resolveNextMatchOpponent(match(), 'home', sideSource)).toBe(sideSource.unknown);
  });
});

describe('formatPlayerMatchRowLabel', () => {
  it('formats full match rows via the template and omits missing parts cleanly', () => {
    expect(
      formatPlayerMatchRowLabel({
        date: '10-nov 18:00',
        opponent: 'Lomas de Rivadavia',
        score: '3–1',
        template: '{date} · {opponent} · {score}',
      }),
    ).toBe('10-nov 18:00 · Lomas de Rivadavia · 3–1');

    expect(
      formatPlayerMatchRowLabel({
        opponent: 'Lomas de Rivadavia',
        score: '3–1',
        template: '{date} · {opponent} · {score}',
      }),
    ).toBe('Lomas de Rivadavia · 3–1');

    expect(
      formatPlayerMatchRowLabel({
        date: '10-nov 18:00',
        opponent: 'Lomas de Rivadavia',
        template: '{date} · {opponent} · {score}',
      }),
    ).toBe('10-nov 18:00 · Lomas de Rivadavia');
  });
});

describe('formatPlayerStatCell', () => {
  it('keeps non-empty server-formatted values unchanged', () => {
    expect(formatPlayerStatCell({ raw: 4, formatted: '4' }, { format: 'number' })).toBe('4');
    expect(
      formatPlayerStatCell({ raw: 0, formatted: '-' }, { format: 'decimal-2', zeroDisplay: '-' }),
    ).toBe('-');
  });

  it('uses column zeroDisplay before falling back to 0 for numbers and em-dash for ratios', () => {
    expect(formatPlayerStatCell({ raw: undefined, formatted: '' }, { format: 'number' })).toBe('0');
    expect(formatPlayerStatCell({ raw: undefined, formatted: '' }, { format: 'fraction' })).toBe(
      '—',
    );
    expect(formatPlayerStatCell({ raw: undefined, formatted: '' }, { format: 'percentage' })).toBe(
      '—',
    );
    expect(
      formatPlayerStatCell(
        { raw: undefined, formatted: '' },
        { format: 'decimal-2', zeroDisplay: '-' },
      ),
    ).toBe('-');
    expect(formatPlayerStatCell(undefined, { format: 'number' })).toBe('0');
    expect(formatPlayerStatCell(undefined, { format: 'decimal-2' })).toBe('—');
  });
});
