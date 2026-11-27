import { act, cleanup, render, screen } from '@testing-library/react';
import {
  publishLiveScoreboardEvent,
  resetLiveScoreboardStore,
  seedLiveScoreboardMatch,
  setLiveStreamStatus,
} from '../../../lib/live-scoreboard-store.js';
import { LiveMatchScoreboard } from './LiveMatchScoreboard.js';

const LABELS = {
  clockStopped: 'Stopped',
  clockAriaLabel: '{segment}, {time}',
  lastUpdated: 'Updated at {time}',
};

describe('LiveMatchScoreboard', () => {
  beforeEach(() => {
    resetLiveScoreboardStore();
  });

  afterEach(() => {
    cleanup();
    resetLiveScoreboardStore();
  });

  it('reacts to match.clock-changed events and stream disconnection notices', () => {
    seedLiveScoreboardMatch({
      matchId: 'match-1',
      projectionVersion: 2,
      state: 'live',
      clock: {
        segmentNumber: 1,
        elapsedSeconds: 600,
        running: true,
        asOf: '2026-04-01T18:10:00.000Z',
      },
      segments: [
        {
          number: 1,
          type: 'half',
          label: { en: 'Half', es: 'Tiempo' },
          state: 'active',
          timed: true,
        },
        {
          number: 2,
          type: 'half',
          label: { en: 'Half', es: 'Tiempo' },
          state: 'pending',
          timed: true,
        },
      ],
    });

    render(
      <LiveMatchScoreboard
        clock={{
          segmentNumber: 1,
          elapsedSeconds: 600,
          running: true,
          asOf: '2026-04-01T18:10:00.000Z',
        }}
        labels={LABELS}
        locale="en"
        matchId="match-1"
        segmentLabel="1st Half"
        timeZone="America/Argentina/San_Juan"
      />,
    );

    expect(screen.getByRole('timer').textContent).toContain('10:00');
    expect(screen.queryByText(/Last updated/)).toBeNull();

    act(() => {
      publishLiveScoreboardEvent({
        eventId: 'evt-1',
        organizationId: 'org-1',
        stream: 'tournament:t-1',
        entityId: 'match-1',
        eventType: 'match.clock-changed',
        projectionVersion: 3,
        createdAt: '2026-04-01T18:15:30.000Z',
        payload: {
          matchId: 'match-1',
          segmentNumber: 2,
          elapsedSeconds: 930,
          running: false,
          changedAt: '2026-04-01T18:15:30.000Z',
        },
      });
      setLiveStreamStatus({
        usingLastKnown: true,
        lastUpdatedAt: '2026-04-01T18:15:30.000Z',
      });
    });

    expect(screen.getByRole('timer').textContent).toContain('2nd Half');
    expect(screen.getByRole('timer').textContent).toContain('15:30');
    expect(screen.getByText('Stopped')).toBeDefined();
    expect(screen.getByText('Updated at 15:15')).toBeDefined();
  });

  it('clears the clock when match.finalized settles the match', () => {
    seedLiveScoreboardMatch({
      matchId: 'match-2',
      projectionVersion: 1,
      state: 'live',
      clock: {
        segmentNumber: 1,
        elapsedSeconds: 1200,
        running: true,
        asOf: '2026-04-01T18:20:00.000Z',
      },
    });

    const { container } = render(
      <LiveMatchScoreboard
        clock={{
          segmentNumber: 1,
          elapsedSeconds: 1200,
          running: true,
          asOf: '2026-04-01T18:20:00.000Z',
        }}
        labels={LABELS}
        locale="en"
        matchId="match-2"
        segmentLabel="1st Half"
      />,
    );

    act(() => {
      publishLiveScoreboardEvent({
        eventId: 'evt-2',
        organizationId: 'org-1',
        stream: 'tournament:t-1',
        entityId: 'match-2',
        eventType: 'match.finalized',
        projectionVersion: 2,
        createdAt: '2026-04-01T19:00:00.000Z',
        payload: { matchId: 'match-2' },
      });
    });

    expect(screen.queryByRole('timer')).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
