import { act, fireEvent, render, screen } from '@testing-library/react';
import type { DiagnosticsSummary } from '@copalibre/contracts';
import { withIntl } from '../../i18n/test-support.js';
import { PlatformDiagnosticsScreen } from './PlatformDiagnosticsScreen.js';

describe('PlatformDiagnosticsScreen', () => {
  const sampleSummary: DiagnosticsSummary = {
    status: 'healthy',
    version: '0.306.0',
    uptimeSeconds: 7320, // 2h 2m
    sampledAt: '2026-09-28T12:00:00.000Z',
    database: {
      connected: true,
      latencyMs: 4.5,
      poolActive: 3,
      poolIdle: 7,
      poolWaiting: 0,
    },
    outbox: {
      available: true,
      pending: 12,
      processed24h: 3400,
      failed: 2,
      oldestPendingAgeSeconds: 15,
      inFlight: 1,
      recentFailures: [
        {
          eventId: '019927d0-0000-7000-8000-000000000101',
          eventType: 'tournament.match_finalized',
          attempts: 6,
          error: 'Connection timeout',
          failedAt: '2026-09-28T11:45:00.000Z',
        },
        {
          eventId: '019927d0-0000-7000-8000-000000000102',
          eventType: 'roster.lineup_submitted',
          attempts: 6,
          error: 'JSON parse failure',
          failedAt: '2026-09-28T11:50:00.000Z',
        },
      ],
    },
    storage: {
      connected: true,
      profile: 'filesystem',
      bucketName: 'copalibre-storage',
      totalObjects: 42,
      totalBytes: 1048576, // 1.0 MB
    },
    realtime: {
      available: true,
      totalConnections: 25,
      tvKiosks: 8,
      overlays: 4,
      publicSpectators: 11,
      controlConnections: 2,
      unclassified: 0,
      activeReplicas: 2,
      staleReplicas: 0,
      reportedAt: '2026-09-28T12:00:00.000Z',
    },
  };

  it('renders loading state when loading and summary is undefined', () => {
    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          loading={true}
          onRefresh={async () => {}}
          onRetryEvents={async () => {}}
          onToggleAutoPoll={() => {}}
          summary={undefined}
        />,
      ),
    );

    expect(screen.getByText(/loading platform diagnostics/i)).toBeDefined();
  });

  it('renders error state when error is provided and summary is undefined', () => {
    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          error="Failed to load diagnostics"
          loading={false}
          onRefresh={async () => {}}
          onRetryEvents={async () => {}}
          onToggleAutoPoll={() => {}}
          summary={undefined}
        />,
      ),
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Failed to load diagnostics')).toBeDefined();
  });

  it('renders healthy status, version, uptime, and telemetry cards', () => {
    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          loading={false}
          onRefresh={async () => {}}
          onRetryEvents={async () => {}}
          onToggleAutoPoll={() => {}}
          summary={sampleSummary}
        />,
      ),
    );

    expect(screen.getByText('Healthy')).toBeDefined();
    expect(screen.getByText(/Uptime: 2h 2m/i)).toBeDefined();
    expect(screen.getByText(/Version 0.306.0/i)).toBeDefined();
    expect(screen.getAllByText(/4.5 ms probe/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pool: 3 active, 7 idle, 0 waiting/i)).toBeDefined();
    expect(screen.getAllByText(/42 objects/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/1.0 MB stored/i)).toBeDefined();
    expect(screen.getByText(/25 subscribers/i)).toBeDefined();
    expect(screen.getAllByText(/2 reporting replicas/i).length).toBeGreaterThan(0);
  });

  it('renders degraded status badge when status is degraded', () => {
    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          loading={false}
          onRefresh={async () => {}}
          onRetryEvents={async () => {}}
          onToggleAutoPoll={() => {}}
          summary={{ ...sampleSummary, status: 'degraded' }}
        />,
      ),
    );

    expect(screen.getByText('Degraded')).toBeDefined();
  });

  it('renders critical status badge when status is critical', () => {
    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          loading={false}
          onRefresh={async () => {}}
          onRetryEvents={async () => {}}
          onToggleAutoPoll={() => {}}
          summary={{
            ...sampleSummary,
            status: 'critical',
            database: { ...sampleSummary.database, connected: false },
          }}
        />,
      ),
    );

    expect(screen.getByText('Critical')).toBeDefined();
    expect(screen.getByText('Disconnected')).toBeDefined();
  });

  it('renders unavailable realtime message when realtime is unavailable', () => {
    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          loading={false}
          onRefresh={async () => {}}
          onRetryEvents={async () => {}}
          onToggleAutoPoll={() => {}}
          summary={{
            ...sampleSummary,
            realtime: { available: false },
          }}
        />,
      ),
    );

    expect(screen.getAllByText(/No reporting replicas/i).length).toBeGreaterThan(0);
  });

  it('renders empty failures message when outbox has no recent failures', () => {
    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          loading={false}
          onRefresh={async () => {}}
          onRetryEvents={async () => {}}
          onToggleAutoPoll={() => {}}
          summary={{
            ...sampleSummary,
            outbox: { ...sampleSummary.outbox, failed: 0, recentFailures: [] },
          }}
        />,
      ),
    );

    expect(screen.getByText(/No dead-lettered events in the outbox queue/i)).toBeDefined();
  });

  it('handles selecting events and opening/confirming retry modal', async () => {
    let retriedIds: readonly string[] = [];
    const onRetryEvents = async (ids: readonly string[]) => {
      retriedIds = ids;
    };

    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          loading={false}
          onRefresh={async () => {}}
          onRetryEvents={onRetryEvents}
          onToggleAutoPoll={() => {}}
          summary={sampleSummary}
        />,
      ),
    );

    const retryBtn = screen.getByRole('button', { name: /retry selected events/i });
    expect(retryBtn.hasAttribute('disabled')).toBe(true);

    const eventOneCheckbox = screen.getByRole('checkbox', {
      name: /select event 019927d0-0000-7000-8000-000000000101/i,
    });
    fireEvent.click(eventOneCheckbox);

    expect(retryBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(retryBtn);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/Retry dead-lettered events/i)).toBeDefined();

    const confirmBtn = screen.getByRole('button', { name: /confirm re-enqueue/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(retriedIds).toEqual(['019927d0-0000-7000-8000-000000000101']);
  });

  it('handles select all failures and canceling retry modal', () => {
    let retriedIds: readonly string[] = [];
    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          loading={false}
          onRefresh={async () => {}}
          onRetryEvents={async (ids) => {
            retriedIds = ids;
          }}
          onToggleAutoPoll={() => {}}
          summary={sampleSummary}
        />,
      ),
    );

    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: /select all dead-lettered events/i,
    });
    fireEvent.click(selectAllCheckbox);

    const retryBtn = screen.getByRole('button', { name: /retry selected events/i });
    expect(retryBtn.hasAttribute('disabled')).toBe(false);

    // Unselect all
    fireEvent.click(selectAllCheckbox);
    expect(retryBtn.hasAttribute('disabled')).toBe(true);

    // Select one then unselect it
    const eventOneCheckbox = screen.getByRole('checkbox', {
      name: /select event 019927d0-0000-7000-8000-000000000101/i,
    });
    fireEvent.click(eventOneCheckbox);
    expect(retryBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(eventOneCheckbox);
    expect(retryBtn.hasAttribute('disabled')).toBe(true);

    // Select again for modal test
    fireEvent.click(selectAllCheckbox);
    expect(retryBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(retryBtn);

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(retriedIds).toEqual([]);
  });

  it('triggers onRefresh when Refresh button is clicked', () => {
    let refreshed = false;
    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          loading={false}
          onRefresh={async () => {
            refreshed = true;
          }}
          onRetryEvents={async () => {}}
          onToggleAutoPoll={() => {}}
          summary={sampleSummary}
        />,
      ),
    );

    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshBtn);

    expect(refreshed).toBe(true);
  });

  it('triggers onToggleAutoPoll when Auto-refresh checkbox is clicked', () => {
    let toggled = false;
    render(
      withIntl(
        <PlatformDiagnosticsScreen
          autoPoll={false}
          loading={false}
          onRefresh={async () => {}}
          onRetryEvents={async () => {}}
          onToggleAutoPoll={(val) => {
            toggled = val;
          }}
          summary={sampleSummary}
        />,
      ),
    );

    const autoPollCheckbox = screen.getByRole('checkbox', {
      name: /auto-refresh \(30s\)/i,
    });
    fireEvent.click(autoPollCheckbox);

    expect(toggled).toBe(true);
  });
});
