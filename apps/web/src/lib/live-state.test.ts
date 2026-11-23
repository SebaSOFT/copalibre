import type { EventEnvelope } from '@copalibre/realtime';
import { applyEvent, type LiveDashboard } from './live-state.js';

function makeDashboard(): LiveDashboard {
  return {
    standingsVersion: 0,
    usingLastKnown: true,
    matches: [
      {
        matchId: 'match-1',
        stageNumber: 1,
        matchNumber: 1,
        stageOrdinal: 1,
        state: 'live',
        projectionVersion: 5,
        clockSeconds: 120,
        clock: {
          segmentNumber: 1,
          elapsedSeconds: 120,
          running: true,
          asOf: '2026-04-01T18:02:00.000Z',
        },
        sides: [
          { entrantId: 'home-1', name: 'Andes', score: 1, state: 'live' },
          { entrantId: 'away-1', name: 'Concepción', score: 0, state: 'live' },
        ],
      },
    ],
  };
}

function makeClockEvent(
  overrides: Partial<EventEnvelope> & {
    payload?: Partial<{
      matchId: string;
      segmentNumber: number;
      elapsedSeconds: number;
      running: boolean;
      changedAt: string;
    }>;
  } = {},
): EventEnvelope {
  return {
    eventId: 'evt-1',
    organizationId: 'org-1',
    stream: 'tournament:t-1',
    entityId: 'match-1',
    eventType: 'match.clock-changed',
    projectionVersion: 6,
    createdAt: '2026-04-01T18:05:00.000Z',
    ...overrides,
    payload: {
      matchId: 'match-1',
      segmentNumber: 2,
      elapsedSeconds: 930,
      running: false,
      changedAt: '2026-04-01T18:05:00.000Z',
      ...overrides.payload,
    },
  };
}

describe('live-state applyEvent for match.clock-changed', () => {
  it('updates clock, clockSeconds, projectionVersion, clockReceivedAt, and lastUpdatedAt', () => {
    const next = applyEvent(makeDashboard(), makeClockEvent());
    const match = next.matches[0];
    expect(match?.projectionVersion).toBe(6);
    expect(match?.clockSeconds).toBe(930);
    expect(match?.clock).toEqual({
      segmentNumber: 2,
      elapsedSeconds: 930,
      running: false,
      asOf: '2026-04-01T18:05:00.000Z',
    });
    expect(typeof match?.clockReceivedAt).toBe('number');
    expect(next.lastUpdatedAt).toBe('2026-04-01T18:05:00.000Z');
  });

  it('ignores stale match.clock-changed events with projectionVersion <= current match version', () => {
    const dashboard = makeDashboard();
    const sameVersion = applyEvent(dashboard, makeClockEvent({ projectionVersion: 5 }));
    expect(sameVersion).toBe(dashboard);

    const olderVersion = applyEvent(dashboard, makeClockEvent({ projectionVersion: 4 }));
    expect(olderVersion).toBe(dashboard);
  });

  it('ignores match.clock-changed events for unknown matches or malformed payloads', () => {
    const dashboard = makeDashboard();
    const otherMatch = applyEvent(
      dashboard,
      makeClockEvent({ payload: { matchId: 'other-match' } }),
    );
    expect(otherMatch).toBe(dashboard);

    const invalidPayload = applyEvent(dashboard, {
      ...makeClockEvent(),
      payload: { matchId: 'match-1', segmentNumber: 'one' },
    });
    expect(invalidPayload).toBe(dashboard);
  });

  it('clears structured clock state when match.finalized settles the match', () => {
    const next = applyEvent(makeDashboard(), {
      eventId: 'evt-final',
      organizationId: 'org-1',
      stream: 'tournament:t-1',
      entityId: 'match-1',
      eventType: 'match.finalized',
      projectionVersion: 7,
      createdAt: '2026-04-01T19:00:00.000Z',
      payload: { matchId: 'match-1' },
    });
    expect(next.matches[0]?.state).toBe('final');
    expect(next.matches[0]?.clock).toBeUndefined();
    expect(next.matches[0]?.clockReceivedAt).toBeUndefined();
    expect(next.lastUpdatedAt).toBe('2026-04-01T19:00:00.000Z');
  });
});
