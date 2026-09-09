/**
 * A fixture that looks right and is not gets reviewed as though it were.
 *
 * These assertions are the difference between demonstration data and invented
 * data: the standings have to follow from the results, the tie has to be a real
 * tie broken by a real head-to-head, and the bracket has to advance from named
 * sources rather than from whichever score is larger.
 */
import { toRounds } from './bracket.js';
import { seriesDecided, seriesScore, seriesSegments, toSeriesInput } from './series.js';
import {
  REFERENCE_ENTRANTS,
  referenceAuditTrail,
  referenceBasketballDashboard,
  referenceBracket,
  referenceGroupMatches,
  referenceLiveDashboard,
  referenceStandings,
  referenceSeries,
} from './reference-fixtures.js';

it('projects the multi-game fixture without inventing a decided winner', () => {
  const projection = referenceSeries();
  const input = toSeriesInput(projection);
  expect(seriesScore(input)).toEqual({
    home: projection.homeGamesWon,
    away: projection.awayGamesWon,
  });
  expect(seriesDecided(input)).toBe(false);
  expect(seriesSegments(input)).toEqual([
    'won-home',
    'won-away',
    'won-home',
    'current',
    'upcoming',
  ]);
  expect(projection.winner).toBeUndefined();
});

describe('reference entrants', () => {
  it('identifies every entrant by a UUIDv7 and a kebab-case alias', () => {
    for (const entrant of REFERENCE_ENTRANTS) {
      expect(entrant.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(entrant.alias).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(new Set(REFERENCE_ENTRANTS.map((e) => e.id)).size).toBe(REFERENCE_ENTRANTS.length);
  });
});

describe('standings fixture', () => {
  /** Three points a win, one a draw — the points the group results imply. */
  const pointsFrom = (name: string): number =>
    referenceGroupMatches().reduce((total, match) => {
      const home = match.home.score ?? 0;
      const away = match.away.score ?? 0;
      if (match.home.name === name) return total + (home > away ? 3 : home === away ? 1 : 0);
      if (match.away.name === name) return total + (away > home ? 3 : home === away ? 1 : 0);
      return total;
    }, 0);

  it('agrees with the results it claims to summarise', () => {
    for (const row of referenceStandings()) {
      expect(row.points).toBe(pointsFrom(row.name));
    }
  });

  it('counts every entrant as having played what the results show', () => {
    for (const row of referenceStandings()) {
      const played = referenceGroupMatches().filter(
        (m) => m.home.name === row.name || m.away.name === row.name,
      ).length;
      expect(row.played).toBe(played);
    }
  });

  it('presents a genuine tie at the top, decided by the head-to-head', () => {
    const [first, second] = referenceStandings();
    expect(first.points).toBe(second.points);

    const headToHead = referenceGroupMatches().find(
      (m) =>
        (m.home.name === first.name && m.away.name === second.name) ||
        (m.home.name === second.name && m.away.name === first.name),
    );
    expect(headToHead).toBeDefined();

    // The leader is the one that won that match — not the one listed first.
    const winner =
      (headToHead?.home.score ?? 0) > (headToHead?.away.score ?? 0)
        ? headToHead?.home.name
        : headToHead?.away.name;
    expect(winner).toBe(first.name);
  });
});

describe('audit fixture', () => {
  it('corrects one match rather than contradicting itself', () => {
    const entries = referenceAuditTrail();
    expect(new Set(entries.map((e) => e.matchId)).size).toBe(1);
    expect(entries.map((e) => e.eventNumber)).toEqual(
      [...entries.map((e) => e.eventNumber)].sort((a, b) => a - b),
    );
  });

  it('never states a correction without its prior state and a reason', () => {
    for (const entry of referenceAuditTrail().filter((e) => e.action === 'SCORE_CORRECTION')) {
      expect(entry.previous).toBeDefined();
      expect(entry.reason).toBeTruthy();
      expect(entry.resulting).not.toBe(entry.previous);
    }
  });

  it('describes a different match from the live one', () => {
    // A record that is 3:1 live and 2:1 corrected at the same time is not a
    // story any surface should be asked to render.
    const live = referenceLiveDashboard().matches[0]?.matchId;
    expect(referenceAuditTrail().every((e) => e.matchId !== live)).toBe(true);
  });
});

describe('bracket fixture', () => {
  it('advances from a named source, never from a score', () => {
    for (const match of referenceBracket().filter((m) => m.roundNumber > 1)) {
      for (const slot of match.slots) {
        expect(slot.kind).toBe('winner-of');
        expect('matchNumber' in slot ? slot.matchNumber : undefined).toBeDefined();
      }
    }
  });

  it('feeds every later round from a match that exists and is earlier', () => {
    const bracket = referenceBracket();
    const byNumber = new Map(bracket.map((m) => [m.matchNumber, m]));
    for (const match of bracket) {
      for (const slot of match.slots) {
        if (slot.kind !== 'winner-of' || slot.matchNumber === undefined) continue;
        const source = byNumber.get(slot.matchNumber);
        expect(source).toBeDefined();
        expect(source?.roundNumber).toBeLessThan(match.roundNumber);
      }
    }
  });

  it('projects through the production round helper', () => {
    const rounds = toRounds(referenceBracket());
    expect(rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3]);
    expect(rounds[0]?.matches).toHaveLength(4);
    expect(rounds[2]?.matches).toHaveLength(1);
  });

  it('leaves the final pending rather than inventing a champion', () => {
    const final = referenceBracket().find((m) => m.roundNumber === 3);
    expect(final?.state).toBe('upcoming');
    expect(final?.scores).toBeUndefined();
  });
});

describe('basketball fixture', () => {
  it('keeps a vocabulary a football descriptor would not produce', () => {
    const match = referenceBasketballDashboard().matches[0];
    // Scores in the dozens and a segment-relative clock: a composition that
    // renders 74' against this is reading the wrong descriptor.
    expect(match?.sides.every((side) => side.score > 40)).toBe(true);
    expect(match?.clockSeconds).toBeLessThan(12 * 60);
  });

  it('is a different match from the football live fixture', () => {
    expect(referenceBasketballDashboard().matches[0]?.matchId).not.toBe(
      referenceLiveDashboard().matches[0]?.matchId,
    );
  });
});
