import { describe, expect, it } from '@jest/globals';
import type { MatchCardData } from './matches-view.js';
import type { ResultStateLabels } from './result-state.js';
import { publicIntl, sideSourceLabels } from './i18n/public-intl.js';
import {
  isTvMatchHeading,
  nextTvMatches,
  orderTvMatches,
  pageTvMatches,
  tvMatchEntriesOf,
  type TvMatchEntry,
} from './tv-match-list.js';

const state: ResultStateLabels = {
  final: 'FINAL',
  live: 'LIVE',
  upcoming: 'NEXT',
  tbd: 'TBD',
  disputed: 'DISPUTED',
  winner: 'WON',
  loser: 'LOST',
  cancelled: 'CANCELLED',
};

const row = (overrides: Partial<MatchCardData> = {}): MatchCardData => ({
  matchId: 'm1',
  stageNumber: 1,
  matchNumber: 1,
  round: 2,
  state: 'final' as const,
  homeName: 'Lomas de Rivadavia',
  homeAbbreviation: 'LOM',
  homeScore: 1,
  awayName: 'Club Hispano',
  awayAbbreviation: 'HIS',
  awayScore: 2,
  groupName: 'Grupo A',
  zoneName: 'Grupos',
  ...overrides,
});

describe('tvMatchEntriesOf', () => {
  const labels = { state, round: 'Round', sideSource: sideSourceLabels(publicIntl('en')) };

  it('shows the abbreviations and keeps the full names for the accessible name', () => {
    const [entry] = tvMatchEntriesOf([row()], labels);

    expect(entry?.home).toEqual({
      label: 'LOM',
      name: 'Lomas de Rivadavia',
      abbreviation: 'LOM',
      pending: false,
      score: 1,
    });
    expect(entry?.away).toEqual({
      label: 'HIS',
      name: 'Club Hispano',
      abbreviation: 'HIS',
      pending: false,
      score: 2,
    });
    expect(entry?.stateLabel).toBe('FINAL');
  });

  it('names where a match belongs by its group, else its zone, and its round', () => {
    expect(tvMatchEntriesOf([row()], labels)[0]?.scope).toBe('Grupo A · Round 2');
    expect(tvMatchEntriesOf([row({ groupName: undefined })], labels)[0]?.scope).toBe(
      'Grupos · Round 2',
    );
    expect(
      tvMatchEntriesOf([row({ groupName: undefined, zoneName: undefined })], labels)[0]?.scope,
    ).toBe('Round 2');
  });

  it('falls back to the name when no abbreviation was chosen, and to the source for an undecided side', () => {
    const [entry] = tvMatchEntriesOf(
      [row({ homeAbbreviation: undefined, awayName: undefined, awayAbbreviation: undefined })],
      labels,
    );

    expect(entry?.home.label).toBe('Lomas de Rivadavia');
    expect(entry?.home.abbreviation).toBeUndefined();
    expect(entry?.away.abbreviation).toBeUndefined();
    expect(entry?.away).toMatchObject({
      label: 'Awaiting participant',
      name: 'Awaiting participant',
      pending: true,
    });
  });

  it('names a placement game by the places it settles', () => {
    const [third] = tvMatchEntriesOf(
      [row({ nodeKey: 'placement-3', round: 1, groupName: undefined, zoneName: undefined })],
      labels,
    );
    expect(third?.scope).toBe('3rd place');
  });

  it('prefixes a multi-zone placement title with its zone name when zonePrefix is provided', () => {
    const [entry] = tvMatchEntriesOf(
      [
        row({
          nodeKey: 'placement-3',
          round: 1,
          groupName: undefined,
          zoneName: 'Copa Oro',
          multiZoneStage: true,
        }),
      ],
      { ...labels, zonePrefix: '{zone} · {placement}' },
    );
    expect(entry?.scope).toBe('Copa Oro · 3rd place');
  });

  it('names an undecided side by its source, with the stage depth naming the round', () => {
    const [semi, final] = tvMatchEntriesOf(
      [
        row({ nodeKey: 'SE-R2-M1', round: 2, zoneName: 'Playoffs', groupName: undefined }),
        row({
          matchId: 'm2',
          nodeKey: 'SE-R3-M1',
          round: 3,
          zoneName: 'Playoffs',
          groupName: undefined,
          awayName: undefined,
          awayAbbreviation: undefined,
          awaySource: { kind: 'winner-of', nodeKey: 'SE-R2-M2', round: 2, position: 2 },
        }),
      ],
      labels,
    );

    expect(semi?.away.pending).toBe(false);
    expect(semi?.scope).toBe('Playoffs · Round 2');
    expect(final?.away).toMatchObject({
      label: 'W Semi 2',
      name: 'Winner of Semi-final 2',
      pending: true,
    });
  });

  it('leaves the score out of a side that has none', () => {
    const [entry] = tvMatchEntriesOf([row({ homeScore: undefined })], labels);
    expect(entry?.home.score).toBeUndefined();
  });

  it('shows no score for an upcoming fixture even when the API sends zeroes', () => {
    const [entry] = tvMatchEntriesOf(
      [row({ state: 'upcoming', homeScore: 0, awayScore: 0 })],
      labels,
    );
    expect(entry?.home.score).toBeUndefined();
    expect(entry?.away.score).toBeUndefined();
  });

  it('marks an upcoming match more than 15 minutes past kickoff as delayed', () => {
    const now = Date.parse('2026-08-01T18:20:00.000Z');
    const [delayedEntry, onTimeEntry] = tvMatchEntriesOf(
      [
        row({
          matchId: 'm-delayed',
          state: 'upcoming' as const,
          scheduledAt: '2026-08-01T18:00:00.000Z',
        }),
        row({
          matchId: 'm-ontime',
          state: 'upcoming' as const,
          scheduledAt: '2026-08-01T18:10:00.000Z',
        }),
      ],
      { ...labels, delayed: 'Delayed' },
      now,
    );

    expect(delayedEntry?.delayed).toBe(true);
    expect(delayedEntry?.stateLabel).toBe('Delayed');
    expect(onTimeEntry?.delayed).toBeUndefined();
    expect(onTimeEntry?.stateLabel).toBe('NEXT');
  });
});

describe('pageTvMatches', () => {
  const entries: readonly TvMatchEntry[] = Array.from({ length: 11 }, (_, index) => ({
    key: `k${index}`,
    scope: '',
    state: 'upcoming' as const,
    stateLabel: '',
    home: { label: 'H', name: 'H' },
    away: { label: 'A', name: 'A' },
  }));

  it('puts two matches in a row and the rows into pages', () => {
    const pages = pageTvMatches(entries, 2, 2);

    expect(pages.map((page) => page.length)).toEqual([2, 2, 2]);
    expect(pages[0]?.[0]?.map((item) => (item as TvMatchEntry).key)).toEqual(['k0', 'k1']);
    expect(pages[2]?.[1]?.map((item) => (item as TvMatchEntry).key)).toEqual(['k10']);
  });

  it('has no pages for no matches', () => {
    expect(pageTvMatches([])).toEqual([]);
  });
});

describe('orderTvMatches', () => {
  const entry = (
    key: string,
    state: 'live' | 'upcoming' | 'final',
    scheduledAt: string,
  ): TvMatchEntry => ({
    key,
    scope: '',
    state,
    stateLabel: state,
    scheduledAt,
    home: { label: 'H', name: 'H' },
    away: { label: 'A', name: 'A' },
  });
  const labels = { live: 'En vivo', upcoming: 'Programado', final: 'Finalizado' };

  it('lists live, then scheduled by kickoff ascending, then finished latest first, each block headed', () => {
    const ordered = orderTvMatches(
      [
        entry('f-early', 'final', '2026-11-01T10:00:00Z'),
        entry('u-late', 'upcoming', '2026-11-03T10:00:00Z'),
        entry('l', 'live', '2026-11-02T10:00:00Z'),
        entry('f-late', 'final', '2026-11-02T10:00:00Z'),
        entry('u-early', 'upcoming', '2026-11-02T09:00:00Z'),
      ],
      labels,
    );

    const keys = ordered.map((item) => (isTvMatchHeading(item) ? `#${item.heading}` : item.key));
    expect(keys).toEqual([
      '#En vivo',
      'l',
      '#Programado',
      'u-early',
      'u-late',
      '#Finalizado',
      'f-late',
      'f-early',
    ]);
  });

  it('omits the heading of an empty block', () => {
    const ordered = orderTvMatches([entry('u', 'upcoming', '2026-11-02T09:00:00Z')], labels);
    expect(ordered.filter(isTvMatchHeading).map((item) => item.heading)).toEqual(['Programado']);
  });

  it('pages a heading as a row of its own, so it never shares a row with an entry', () => {
    const ordered = orderTvMatches(
      [entry('l', 'live', '2026-11-02T10:00:00Z'), entry('u', 'upcoming', '2026-11-02T09:00:00Z')],
      labels,
    );
    const rows = pageTvMatches(ordered, 10, 2)[0] ?? [];
    expect(rows.map((row) => row.length)).toEqual([1, 1, 1, 1]);
  });
});

describe('nextTvMatches', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const match = (key: string, state: string, scheduledAt: string | null) => ({
    key,
    state,
    scheduledAt,
  });

  it('excludes kickoffs in the past, orders by kickoff and caps at the count', () => {
    const next = nextTvMatches(
      [
        match('late', 'upcoming', '2026-11-27T10:00:00Z'),
        match('past', 'upcoming', '2026-11-25T11:00:00Z'),
        match('soon', 'upcoming', '2026-11-26T10:00:00Z'),
        match('live', 'live', '2026-11-26T09:00:00Z'),
        match('third', 'upcoming', '2026-11-28T10:00:00Z'),
      ],
      now,
      2,
    );
    expect(next.map((item) => item.key)).toEqual(['soon', 'late']);
  });

  it('returns nothing when no scheduled match remains', () => {
    expect(nextTvMatches([match('final', 'final', '2026-11-20T10:00:00Z')], now, 1)).toEqual([]);
  });
});
