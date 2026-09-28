import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DiagnosticsSummary } from '@copalibre/contracts';
import { PlatformDiagnosticsScreen } from './PlatformDiagnosticsScreen.js';

const healthySummary: DiagnosticsSummary = {
  status: 'healthy',
  version: '0.306.0',
  uptimeSeconds: 86400 + 3600 * 4 + 120,
  sampledAt: '2026-09-28T12:00:00.000Z',
  database: {
    connected: true,
    latencyMs: 3.2,
    poolActive: 2,
    poolIdle: 8,
    poolWaiting: 0,
  },
  outbox: {
    available: true,
    pending: 4,
    processed24h: 18420,
    failed: 2,
    oldestPendingAgeSeconds: 12,
    inFlight: 1,
    recentFailures: [
      {
        eventId: '019927d0-0000-7000-8000-000000000101',
        eventType: 'tournament.match_finalized',
        attempts: 6,
        error: 'Connection timeout contacting external webhook',
        failedAt: '2026-09-28T11:45:00.000Z',
      },
      {
        eventId: '019927d0-0000-7000-8000-000000000102',
        eventType: 'roster.lineup_submitted',
        attempts: 6,
        error: 'JSON parsing failure in event payload',
        failedAt: '2026-09-28T11:50:00.000Z',
      },
    ],
  },
  storage: {
    connected: true,
    profile: 'filesystem',
    bucketName: 'copalibre-storage',
    totalObjects: 124,
    totalBytes: 52428800,
  },
  realtime: {
    available: true,
    totalConnections: 35,
    tvKiosks: 10,
    overlays: 5,
    publicSpectators: 18,
    controlConnections: 2,
    unclassified: 0,
    activeReplicas: 2,
    staleReplicas: 0,
    reportedAt: '2026-09-28T12:00:00.000Z',
  },
};

const meta = {
  title: 'Admin/Screens/PlatformDiagnosticsScreen',
  component: PlatformDiagnosticsScreen,
  args: {
    summary: healthySummary,
    loading: false,
    autoPoll: false,
    onToggleAutoPoll: () => {},
    onRefresh: async () => {},
    onRetryEvents: async () => {},
    retrying: false,
  },
} satisfies Meta<typeof PlatformDiagnosticsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

export const Empty: Story = {
  args: {
    summary: {
      ...healthySummary,
      outbox: {
        ...healthySummary.outbox,
        failed: 0,
        recentFailures: [],
      },
    },
  },
};

export const Loading: Story = {
  args: {
    loading: true,
    summary: undefined,
  },
};

export const Degraded: Story = {
  args: {
    summary: {
      ...healthySummary,
      status: 'degraded',
      database: {
        ...healthySummary.database,
        latencyMs: 145.8,
      },
      realtime: {
        ...healthySummary.realtime,
        activeReplicas: 1,
        staleReplicas: 1,
      },
    },
  },
};

export const Critical: Story = {
  args: {
    summary: {
      ...healthySummary,
      status: 'critical',
      database: {
        connected: false,
        latencyMs: 2500,
        poolActive: 0,
        poolIdle: 0,
        poolWaiting: 15,
      },
      realtime: {
        available: false,
        activeReplicas: 0,
        staleReplicas: 2,
      },
    },
  },
};
