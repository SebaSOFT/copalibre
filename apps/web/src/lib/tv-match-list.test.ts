import { describe, expect, it } from '@jest/globals';
import type { MatchCardData } from './matches-view.js';
import type { ResultStateLabels } from './result-state.js';
import { pageTvMatches, tvMatchEntriesOf, type TvMatchEntry } from './tv-match-list.js';

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
  state: 'final',
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
  const labels = { state, round: 'Round' };

  it('shows the abbreviations and keeps the full names for the accessible name', () => {
    const [entry] = tvMatchEntriesOf([row()], labels);

    expect(entry?.home).toEqual({ label: 'LOM', name: 'Lomas de Rivadavia', score: 1 });
    expect(entry?.away).toEqual({ label: 'HIS', name: 'Club Hispano', score: 2 });
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

  it('falls back to the name when no abbreviation was chosen, and to a dash for an unknown side', () => {
    const [entry] = tvMatchEntriesOf(
      [row({ homeAbbreviation: undefined, awayName: undefined, awayAbbreviation: undefined })],
      labels,
    );

    expect(entry?.home.label).toBe('Lomas de Rivadavia');
    expect(entry?.away.label).toBe('—');
  });

  it('leaves the score out of a side that has none', () => {
    const [entry] = tvMatchEntriesOf([row({ homeScore: undefined })], labels);
    expect(entry?.home.score).toBeUndefined();
  });
});

describe('pageTvMatches', () => {
  const entries: readonly TvMatchEntry[] = Array.from({ length: 11 }, (_, index) => ({
    key: `k${index}`,
    scope: '',
    stateLabel: '',
    home: { label: 'H', name: 'H' },
    away: { label: 'A', name: 'A' },
  }));

  it('puts two matches in a row and the rows into pages', () => {
    const pages = pageTvMatches(entries, 2, 2);

    expect(pages.map((page) => page.length)).toEqual([2, 2, 2]);
    expect(pages[0]?.[0]?.map((entry) => entry.key)).toEqual(['k0', 'k1']);
    expect(pages[2]?.[1]?.map((entry) => entry.key)).toEqual(['k10']);
  });

  it('has no pages for no matches', () => {
    expect(pageTvMatches([])).toEqual([]);
  });
});
