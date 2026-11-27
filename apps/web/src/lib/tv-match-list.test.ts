import { describe, expect, it } from '@jest/globals';
import type { MatchCardData } from './matches-view.js';
import type { ResultStateLabels } from './result-state.js';
import { publicIntl, sideSourceLabels } from './i18n/public-intl.js';
import {
  isTvMatchHeading,
  featuredTvMatch,
  chunkTvRows,
  nextTvMatches,
  orderTvMatches,
  overlayTvEntries,
  pageTvMatches,
  tvMatchEntriesOf,
  tvMatchEntriesOfView,
  tvMatchLabelTextOf,
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

describe('next match under the delayed rule', () => {
  const at = (iso: string): number => Date.parse(iso);
  const scheduled = (key: string, scheduledAt: string | null) => ({
    key,
    state: 'upcoming',
    scheduledAt,
  });

  it('counts a kickoff 3 minutes ago as next, since it is not delayed yet', () => {
    const now = at('2026-11-25T10:03:00Z');
    const next = nextTvMatches([scheduled('ten', '2026-11-25T10:00:00Z')], now, 1);
    expect(next.map((match) => match.key)).toEqual(['ten']);
  });

  it('drops a match 20 minutes past kickoff; the following match is next', () => {
    const now = at('2026-11-25T10:20:00Z');
    const matches = [
      scheduled('ten', '2026-11-25T10:00:00Z'),
      scheduled('eleven', '2026-11-25T11:00:00Z'),
    ];
    expect(nextTvMatches(matches, now, 1).map((match) => match.key)).toEqual(['eleven']);
  });

  it('never makes a match without a kickoff next', () => {
    const now = at('2026-11-25T10:00:00Z');
    expect(nextTvMatches([scheduled('none', null)], now, 1)).toEqual([]);
  });

  it('falls back to the latest finished match before a delayed one', () => {
    const now = at('2026-11-25T12:00:00Z');
    const matches = [
      scheduled('late', '2026-11-25T09:00:00Z'),
      { key: 'done', state: 'final', scheduledAt: '2026-11-24T18:00:00Z' },
    ];
    expect(featuredTvMatch(matches, now)?.key).toBe('done');
  });

  it('shows the most recently delayed match, labelled, when nothing else is left', () => {
    const now = at('2026-11-25T12:00:00Z');
    const matches = [
      scheduled('older', '2026-11-25T08:00:00Z'),
      scheduled('recent', '2026-11-25T10:00:00Z'),
    ];
    const featured = featuredTvMatch(matches, now);
    expect(featured?.key).toBe('recent');
    // The label is the delayed one: the match is past kickoff by more than 15 minutes.
    expect(Date.parse('2026-11-25T10:00:00Z') + 15 * 60_000 < now).toBe(true);
  });

  it('features nothing when no match is scheduled, finished or delayed', () => {
    expect(featuredTvMatch([], at('2026-11-25T12:00:00Z'))).toBeUndefined();
  });
});

describe('orderTvMatches keeps every entry', () => {
  const entry = (key: string, state: string, scheduledAt?: string): TvMatchEntry => ({
    key,
    scope: '',
    state: state as TvMatchEntry['state'],
    stateLabel: state,
    ...(scheduledAt === undefined ? {} : { scheduledAt }),
    home: { label: 'H', name: 'H' },
    away: { label: 'A', name: 'A' },
  });

  it('places disputed, cancelled and tbd entries in blocks after the three main ones', () => {
    const entries = [
      entry('disputed', 'disputed', '2026-11-02T10:00:00Z'),
      entry('final', 'final', '2026-11-01T10:00:00Z'),
      entry('cancelled', 'cancelled'),
      entry('tbd', 'tbd', '2026-11-03T10:00:00Z'),
      entry('live', 'live', '2026-11-04T10:00:00Z'),
    ];
    const ordered = orderTvMatches(entries, {
      live: 'En vivo',
      final: 'Finalizado',
      disputed: 'En litige',
      cancelled: 'Annulé',
      tbd: 'À définir',
    });
    const entriesOut = ordered.filter((item) => !isTvMatchHeading(item));
    expect(entriesOut).toHaveLength(entries.length);
    expect(ordered.filter(isTvMatchHeading).map((item) => item.heading)).toEqual([
      'En vivo',
      'Finalizado',
      'En litige',
      'Annulé',
      'À définir',
    ]);
  });
});

describe('the list follows the live projection', () => {
  const labels = { live: 'En vivo', upcoming: 'Programado', final: 'Finalizado' } as never;
  const entry = (key: string, state: 'upcoming' | 'live' | 'final', home?: number) => ({
    key,
    scope: '',
    state,
    stateLabel: state,
    home: { label: 'H', name: 'H', ...(home === undefined ? {} : { score: home }) },
    away: { label: 'A', name: 'A', score: 0 },
  });

  it('takes the live state and score of a match the projection has under way', () => {
    const [live] = overlayTvEntries(
      [entry('m1', 'upcoming')],
      [{ matchId: 'm1', state: 'live', sides: [{ score: 2 }, { score: 0 }] }],
      labels,
    );
    expect(live?.state).toBe('live');
    expect(live?.stateLabel).toBe('En vivo');
    expect(live?.home.score).toBe(2);
  });

  it('lays no score over an upcoming entry, even when the projection carries a 0 – 0', () => {
    const [upcoming] = overlayTvEntries(
      [entry('m9', 'upcoming')],
      [{ matchId: 'm9', state: 'upcoming', sides: [{ score: 0 }, { score: 0 }] }],
      labels,
    );
    expect(upcoming?.home.score).toBeUndefined();
    expect(upcoming?.away.score).toBeUndefined();
  });

  it('keeps the delayed label of an entry the projection still lists as upcoming', () => {
    const delayed = { ...entry('m5', 'upcoming'), stateLabel: 'Delayed', delayed: true };
    const [kept] = overlayTvEntries(
      [delayed],
      [{ matchId: 'm5', state: 'upcoming', sides: [{ score: 0 }, { score: 0 }] }],
      labels,
    );
    expect(kept?.stateLabel).toBe('Delayed');
    expect(kept?.delayed).toBe(true);
  });

  it('lays the live score over an entry that already reads live', () => {
    const [live] = overlayTvEntries(
      [entry('m3', 'live')],
      [{ matchId: 'm3', state: 'live', sides: [{ score: 1 }, { score: 2 }] }],
      labels,
    );
    expect(live?.home.score).toBe(1);
    expect(live?.away.score).toBe(2);
  });

  it('leaves an entry the projection does not list as it was', () => {
    const [kept] = overlayTvEntries([entry('m2', 'upcoming')], [], labels);
    expect(kept?.state).toBe('upcoming');
    expect(kept?.home.score).toBeUndefined();
  });

  it('cuts rows into fixed pages of the measured size', () => {
    expect(chunkTvRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkTvRows([], 2)).toEqual([]);
  });
});

describe('tvMatchEntriesOfView', () => {
  const text = tvMatchLabelTextOf({
    resultState: state,
    bracketRound: 'Round',
    sideSource: sideSourceLabels(publicIntl('en')),
    overallPlace: '{place} overall',
  });
  const fifth = row({
    nodeKey: 'placement-5',
    matchNumber: 4,
    stageNumber: 2,
    zoneName: 'Copa Oro',
    groupName: undefined,
    placement: { from: 5 },
  });
  const bracket = {
    stageNumber: 2,
    zones: [{ zoneName: 'Copa Oro', overallPlaceOffset: 4 }],
  };

  it('names a placement with its overall place when its stage bracket is at hand', () => {
    const [entry] = tvMatchEntriesOfView([fifth], text, bracket, Date.now());
    expect(entry?.scope).toBe('Copa Oro · 5th place · 9 overall');
  });

  it('names the same placement without the overall place when its stage bracket is not held', () => {
    const [entry] = tvMatchEntriesOfView([fifth], text, undefined, Date.now());
    expect(entry?.scope).toBe('Copa Oro · 5th place');
  });

  it('keeps a bracket of another stage out of the label', () => {
    const [entry] = tvMatchEntriesOfView([fifth], text, { ...bracket, stageNumber: 1 }, Date.now());
    expect(entry?.scope).toBe('Copa Oro · 5th place');
  });
});
