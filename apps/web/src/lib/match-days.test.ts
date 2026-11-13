import { calendarDayKey, matchDays, openMatchDay } from './match-days.js';
import type { MatchCardData } from './matches-view.js';

const match = (overrides: Partial<MatchCardData> = {}): MatchCardData => ({
  matchId: 'match',
  stageNumber: 1,
  matchNumber: 1,
  state: 'upcoming',
  ...overrides,
});

describe('matchDays', () => {
  it('groups by calendar day in the organization time zone, not UTC', () => {
    // 01:15 UTC on the 14th is 22:15 on the 13th in Buenos Aires.
    const late = match({ matchId: 'late', scheduledAt: '2026-11-14T01:15:00.000Z' });
    const early = match({ matchId: 'early', scheduledAt: '2026-11-13T12:00:00.000Z' });
    const next = match({ matchId: 'next', scheduledAt: '2026-11-14T12:00:00.000Z' });

    const days = matchDays([next, late, early], 'America/Argentina/Buenos_Aires');

    expect(days.map((day) => day.key)).toEqual(['2026-11-13', '2026-11-14']);
    expect(days[0]?.matches.map((one) => one.matchId)).toEqual(['early', 'late']);
    expect(days[1]?.matches.map((one) => one.matchId)).toEqual(['next']);
  });

  it('puts matches without a kickoff in one last, undated day', () => {
    const undated = match({ matchId: 'undated' });
    const invalid = match({ matchId: 'invalid', scheduledAt: 'soon' });
    const dated = match({ matchId: 'dated', scheduledAt: '2026-11-13T12:00:00.000Z' });

    const days = matchDays([undated, dated, invalid], 'UTC');

    expect(days.map((day) => day.key)).toEqual(['2026-11-13', undefined]);
    expect(days[1]?.matches.map((one) => one.matchId)).toEqual(['undated', 'invalid']);
  });

  it('marks the days that hold a live match', () => {
    const days = matchDays(
      [
        match({ matchId: 'a', state: 'final', scheduledAt: '2026-11-13T12:00:00.000Z' }),
        match({ matchId: 'b', state: 'live', scheduledAt: '2026-11-14T12:00:00.000Z' }),
      ],
      'UTC',
    );

    expect(days.map((day) => day.hasLive)).toEqual([false, true]);
  });
});

describe('openMatchDay', () => {
  const day = (key: string, ...matches: MatchCardData[]) => ({
    key,
    matches,
    hasLive: matches.some((one) => one.state === 'live'),
  });

  it('opens the day of the earliest live match', () => {
    const finished = day('2026-11-13', match({ state: 'final' }));
    const live = day(
      '2026-11-14',
      match({ state: 'live', scheduledAt: '2026-11-14T12:00:00.000Z' }),
    );
    const upcoming = day(
      '2026-11-15',
      match({ state: 'upcoming', scheduledAt: '2026-11-15T12:00:00.000Z' }),
    );

    expect(openMatchDay([finished, live, upcoming])).toBe(live);
  });

  it('opens the next match day when nothing is live', () => {
    const finished = day('2026-11-13', match({ state: 'final' }));
    const later = day(
      '2026-11-16',
      match({ state: 'upcoming', scheduledAt: '2026-11-16T12:00:00.000Z' }),
    );
    const next = day(
      '2026-11-14',
      match({ state: 'upcoming', scheduledAt: '2026-11-14T12:00:00.000Z' }),
    );

    expect(openMatchDay([finished, next, later])).toBe(next);
  });

  it('opens the last dated day once every match is over', () => {
    const first = day('2026-11-13', match({ state: 'final' }));
    const last = day('2026-11-14', match({ state: 'final' }));
    const undated = { matches: [match({ state: 'final' })], hasLive: false };

    expect(openMatchDay([first, last, undated])).toBe(last);
  });

  it('opens nothing for an empty schedule', () => {
    expect(openMatchDay([])).toBeUndefined();
  });
});

describe('calendarDayKey', () => {
  it('reads the day in the given zone', () => {
    expect(calendarDayKey(Date.parse('2026-11-14T01:15:00.000Z'), 'UTC')).toBe('2026-11-14');
    expect(
      calendarDayKey(Date.parse('2026-11-14T01:15:00.000Z'), 'America/Argentina/Buenos_Aires'),
    ).toBe('2026-11-13');
  });
});
