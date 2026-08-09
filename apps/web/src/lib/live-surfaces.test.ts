import type { EventEnvelope } from '@copalibre/realtime';
import { decide, presentState, resultLegend, type ResultStateLabels } from './result-state.js';
import { describeSlot, isResolved, toNode, toRounds } from './bracket.js';
import { sampleBracket } from './bracket-sample.js';
import { seriesDecided, seriesScore, seriesSegments } from './series.js';
import { applyEvent, applyEvents, markConnected } from './live-state.js';
import { sampleDashboard } from './live-sample.js';

/** Matches `public-messages.en.ts`'s `defaultMessage` values exactly. */
const LABELS: ResultStateLabels = {
  live: 'LIVE',
  upcoming: 'UPCOMING',
  final: 'FINAL',
  disputed: 'DISPUTED',
  winner: 'WON',
  loser: 'LOST',
  tbd: 'TBD',
  cancelled: 'CANCELLED',
};

describe('a state is never a colour alone', () => {
  it('gives every state a label and an icon alongside its class', () => {
    for (const state of resultLegend(LABELS)) {
      expect(state.label.length).toBeGreaterThan(0);
      expect(state.icon.length).toBeGreaterThan(0);
      expect(state.className).toContain('cl-state--');
    }
  });

  it('resolves a state to all three at once, so a template cannot take just the colour', () => {
    expect(presentState('live', LABELS)).toEqual({
      state: 'live',
      label: 'LIVE',
      icon: '●',
      className: 'cl-state--live',
    });
  });

  it('decides winner and loser as a pair', () => {
    // A row deciding on its own can call both sides the winner after a
    // correction.
    expect(decide(3, 1)).toEqual({ home: 'winner', away: 'loser' });
    expect(decide(1, 3)).toEqual({ home: 'loser', away: 'winner' });
    expect(decide(2, 2)).toEqual({ home: 'final', away: 'final' });
    expect(decide(undefined, 1)).toBeUndefined();
  });
});

describe('a bracket that is not a tree', () => {
  const matches = sampleBracket();

  it('groups a double-elimination shape into branches and rounds', () => {
    const rounds = toRounds(matches);

    expect(rounds.map((round) => round.branch)).toEqual(['final', 'losers', 'winners']);
    expect(rounds.find((round) => round.branch === 'winners')?.matches).toHaveLength(2);
  });

  it('names an unresolved slot instead of leaving it blank', () => {
    // A blank cell reads as a bug; "Ganador del 2" says what has to happen.
    expect(describeSlot({ kind: 'winner-of', matchNumber: 2 })).toBe('Ganador del 2');
    expect(describeSlot({ kind: 'loser-of', matchNumber: 1 })).toBe('Perdedor del 1');
    expect(describeSlot({ kind: 'seed', seed: 4 })).toBe('Sembrado 4');
    expect(describeSlot({ kind: 'entrant', name: 'Casa de Italia', abbreviation: 'C I' })).toBe(
      'C I',
    );
    expect(describeSlot({ kind: 'entrant', name: 'Casa de Italia' })).toBe('Casa de Italia');
  });

  it('renders the grand final as pending while the semifinals are unresolved', () => {
    const final = matches.find((match) => match.branch === 'final');
    if (!final) throw new Error('the sample bracket has no grand final');
    const node = toNode(final, LABELS);

    expect(isResolved(final)).toBe(false);
    expect(node.slots.every((slot) => slot.pending)).toBe(true);
    expect(node.badge.label).toBe('TBD');
  });

  it('carries scores onto a decided node', () => {
    const [decided] = matches;
    if (!decided) throw new Error('the sample bracket is empty');
    const node = toNode(decided, LABELS);

    expect(node.slots[0]?.score).toBe(3);
    expect(node.slots[0]?.pending).toBe(false);
  });
});

describe('the series bar', () => {
  it('always has one segment per game the format allows', () => {
    // A bar that grows hides how many are left.
    expect(seriesSegments({ bestOf: 5, results: ['home'] })).toEqual([
      'won-home',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });

  it('marks the game in progress', () => {
    expect(seriesSegments({ bestOf: 3, results: ['away'], inProgress: true })).toEqual([
      'won-away',
      'current',
      'upcoming',
    ]);
  });

  it('never grows past the format, however long the history', () => {
    expect(seriesSegments({ bestOf: 3, results: ['home', 'home', 'away', 'away'] })).toHaveLength(
      3,
    );
  });

  it('counts and decides', () => {
    expect(seriesScore({ bestOf: 5, results: ['home', 'away', 'home'] })).toEqual({
      home: 2,
      away: 1,
    });
    expect(seriesDecided({ bestOf: 3, results: ['home', 'home'] })).toBe(true);
    expect(seriesDecided({ bestOf: 5, results: ['home', 'home'] })).toBe(false);
  });
});

function event(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: 'ev-1',
    organizationId: 'org-1',
    stream: 'match:m-1',
    entityId: 'm-1',
    eventType: 'match.finalized',
    projectionVersion: 4,
    createdAt: '2026-08-01T20:00:00.000Z',
    payload: {
      matchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      result: {
        sides: [
          { entrantId: 'en-1', statistics: { goals: 3 } },
          { entrantId: 'en-2', statistics: { goals: 1 } },
        ],
      },
    },
    ...overrides,
  };
}

describe('live events patch what the server rendered', () => {
  it('updates the score without a reload', () => {
    const next = applyEvent(sampleDashboard(), event());

    expect(next.matches[0]?.sides.map((side) => side.score)).toEqual([3, 1]);
    expect(next.matches[0]?.state).toBe('final');
    expect(next.matches[0]?.sides.map((side) => side.state)).toEqual(['winner', 'loser']);
  });

  it('ignores an event older than what the match already has', () => {
    // A reconnect replays; without this a finished match walks backwards
    // through its own history on screen.
    const replayed = applyEvent(sampleDashboard(), event({ projectionVersion: 1 }));

    expect(replayed.matches[0]?.sides.map((side) => side.score)).toEqual([2, 1]);
  });

  it('is idempotent over a replayed batch', () => {
    const once = applyEvents(sampleDashboard(), [event()]);
    const twice = applyEvents(sampleDashboard(), [event(), event(), event()]);

    expect(twice).toEqual(once);
  });

  it('marks a superseded result as disputed rather than final', () => {
    // Saying "final" through the correction window keeps a wrong score up.
    const next = applyEvent(
      sampleDashboard(),
      event({ eventType: 'result.superseded', projectionVersion: 5 }),
    );

    expect(next.matches[0]?.state).toBe('disputed');
  });

  it('marks a match live when it starts', () => {
    const next = applyEvent(
      sampleDashboard(),
      event({
        eventType: 'match.started',
        projectionVersion: 9,
        payload: { matchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      }),
    );

    expect(next.matches[0]?.state).toBe('live');
  });

  it('leaves another match alone', () => {
    const next = applyEvent(sampleDashboard(), event({ payload: { matchId: 'otro' } }));

    expect(next).toEqual(sampleDashboard());
  });

  it('advances the standings version only forwards', () => {
    const base = sampleDashboard();

    expect(
      applyEvent(base, event({ eventType: 'standings.recalculated', projectionVersion: 9 }))
        .standingsVersion,
    ).toBe(9);
    expect(
      applyEvent(base, event({ eventType: 'standings.recalculated', projectionVersion: 1 })),
    ).toEqual(base);
  });

  it('ignores an event this screen has no use for', () => {
    const base = sampleDashboard();

    expect(applyEvent(base, event({ eventType: 'schedule.published' }))).toEqual(base);
  });

  it('ignores a payload with no readable scores', () => {
    const base = sampleDashboard();
    const next = applyEvent(
      base,
      event({ projectionVersion: 7, payload: { matchId: base.matches[0]?.matchId, result: {} } }),
    );

    expect(next.matches[0]?.sides.map((side) => side.score)).toEqual([2, 1]);
  });
});

describe('when the stream never connects', () => {
  it('renders the last-known state and says so', () => {
    // The page arrived complete from the server; the stream is an improvement.
    expect(sampleDashboard().usingLastKnown).toBe(true);
  });

  it('stops saying so once something arrives', () => {
    const connected = markConnected(sampleDashboard());

    expect(connected.usingLastKnown).toBe(false);
    expect(markConnected(connected)).toBe(connected);
  });
});
