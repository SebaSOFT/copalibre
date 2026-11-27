import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MatchConsolePage } from './components/pages/MatchConsolePage.js';
import { type MatchConsoleApiClient } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';
import { clearAll, enqueue, listPending } from './lib/offline-queue.js';
import { client, projection, syncIndicator } from './match-console-route.test-support.js';

beforeEach(async () => {
  await clearAll();
});

describe('MatchConsolePage', () => {
  describe('offline queue', () => {
    it('leaves a network-failed clock adjustment queued, not lost, with no error banner', async () => {
      await act(async () => {
        render(
          withIntl(
            <MatchConsolePage
              client={client({
                adjustMatchClock: async () => {
                  throw new TypeError('Failed to fetch');
                },
              })}
              matchId="match-1"
              organizationAlias="liga"
              tournamentAlias="apertura"
            />,
          ),
        );
      });

      fireEvent.change(screen.getByLabelText('Time (mm:ss)'), { target: { value: '02:10' } });
      fireEvent.click(screen.getByRole('button', { name: 'Correct' }));

      await waitFor(async () => expect(await listPending('match-1')).toHaveLength(1));
      fireEvent.focus(syncIndicator());
      expect(await screen.findByText('1 queued action')).toBeDefined();
      expect(screen.queryByRole('alert')).toBeNull();
      const pending = await listPending('match-1');
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ status: 'pending', action: { kind: 'clock-adjust' } });
    });

    it('resumes draining a queue left over from a prior session on mount (refresh-survivability)', async () => {
      await enqueue(
        {
          kind: 'clock-adjust',
          organizationAlias: 'liga',
          tournamentAlias: 'apertura',
          matchId: 'match-1',
          request: { segmentId: 'segment-1', elapsedSeconds: 42, activate: true },
        },
        'leftover-key',
        1_000,
      );

      const adjustMatchClock = jest.fn<MatchConsoleApiClient['adjustMatchClock']>(
        async () => projection,
      );
      await act(async () => {
        render(
          withIntl(
            <MatchConsolePage
              client={client({ adjustMatchClock })}
              matchId="match-1"
              organizationAlias="liga"
              tournamentAlias="apertura"
            />,
          ),
        );
      });

      await waitFor(() =>
        expect(adjustMatchClock).toHaveBeenCalledWith(
          'liga',
          'apertura',
          'match-1',
          { segmentId: 'segment-1', elapsedSeconds: 42, activate: true },
          'leftover-key',
        ),
      );
      await waitFor(async () => expect(await listPending('match-1')).toHaveLength(0));
    });

    it('keeps queue counts and last successful sync visible in the header', async () => {
      await act(async () => {
        render(
          withIntl(
            <MatchConsolePage
              client={client()}
              matchId="match-1"
              organizationAlias="liga"
              tournamentAlias="apertura"
            />,
          ),
        );
      });
      expect(syncIndicator().textContent).toContain('Last synced');
      fireEvent.change(screen.getByLabelText('Time (mm:ss)'), { target: { value: '02:10' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
      });
      await waitFor(() => expect(syncIndicator().textContent).toContain('Last synced'));
      expect(syncIndicator().textContent).not.toContain('Not yet synced');
    });

    it('shows online and offline as one glanceable icon with an accessible name', async () => {
      await act(async () => {
        render(
          withIntl(
            <MatchConsolePage
              client={client()}
              matchId="match-1"
              organizationAlias="liga"
              tournamentAlias="apertura"
            />,
          ),
        );
      });

      expect(syncIndicator().textContent).toContain('Online');
      expect(syncIndicator().getAttribute('aria-live')).toBe('polite');

      await act(async () => {
        globalThis.dispatchEvent(new Event('offline'));
      });

      expect(syncIndicator().textContent).toContain('Offline');
      expect(syncIndicator().textContent).toContain('Offline');
    });
  });
});
