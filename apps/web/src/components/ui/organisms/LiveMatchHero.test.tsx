import { jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { RealtimeClient, type RealtimeHandlers } from '@copalibre/realtime';
import { LiveMatchHero } from './LiveMatchHero.js';

describe('LiveMatchHero connection state', () => {
  let connectSpy: ReturnType<typeof jest.spyOn>;
  let capturedHandlers: RealtimeHandlers | undefined;

  beforeEach(() => {
    capturedHandlers = undefined;
    connectSpy = jest
      .spyOn(RealtimeClient.prototype, 'connect')
      .mockImplementation(async (handlers) => {
        capturedHandlers = handlers;
        return { attempts: 1, stopped: 'aborted' as const };
      });
  });

  afterEach(() => connectSpy.mockRestore());

  it('marks server-rendered scores stale on failure and clears the mark after reconnecting', () => {
    render(
      <LiveMatchHero
        initial={{
          matches: [
            {
              matchId: 'match-1',
              stageNumber: 1,
              matchNumber: 1,
              state: 'live',
              projectionVersion: 1,
              sides: [
                { entrantId: 'home', name: 'Boca Juniors', score: 2, state: 'live' },
                { entrantId: 'away', name: 'River Plate', score: 1, state: 'live' },
              ],
            },
          ],
          standingsVersion: 1,
          usingLastKnown: false,
        }}
        streamPath="/events/public/liga/tournaments/apertura"
        versusLabel="vs"
        usingLastKnownText="Last known results: live connection lost"
        noMatchesText="No matches"
        nextKickoffText="Next match"
        locale="en"
        referenceDate={0}
        resultStateLabels={{
          live: 'Live',
          upcoming: 'Upcoming',
          final: 'Final',
          disputed: 'Disputed',
          winner: 'Winner',
          loser: 'Loser',
          tbd: 'To be determined',
          cancelled: 'Cancelled',
        }}
      />,
    );

    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      capturedHandlers?.onFailure?.({ kind: 'recoverable', reason: 'offline', renewToken: false });
    });
    expect(screen.getByRole('status').textContent).toBe('Last known results: live connection lost');
    expect(screen.getByText('Boca Juniors')).toBeDefined();
    expect(screen.getByText('River Plate')).toBeDefined();

    act(() => capturedHandlers?.onOpen?.());
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Boca Juniors')).toBeDefined();
  });
});
