import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlatformAdministrationTemplate } from '../screens/PlatformAdministrationTemplate.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient } from '../screen-story-fixtures.js';

const client = storyClient<ControlApiClient>({});

const meta = {
  title: 'Admin/Screens/PlatformAdministrationTemplate',
  component: PlatformAdministrationTemplate,
  args: {
    api: client,
    authoringBusy: false,
    authoringFailures: [],
    busy: undefined,
    disciplineOptions: [],
    loadingModules: false,
    loadingSuperAdmins: false,
    modules: [],
    onAuthorModule: async () => true,
    onCheckOutdated: async () => undefined,
    onContributeModule: async () => undefined,
    onCreateOrganization: async () => 'liga-san-juan',
    onCreateSuperAdmin: async () => true,
    onInstallModule: async () => true,
    onInviteAdmin: async () => true,
    onRemoveModule: async () => undefined,
    onRemoveSuperAdmin: async () => undefined,
    onVerifyModule: async () => undefined,
    outdated: [],
    superAdmins: [],
    verification: [],
  },
} satisfies Meta<typeof PlatformAdministrationTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const WithModules: Story = {
  args: {
    modules: [
      {
        moduleId: 'mod-1',
        kind: 'discipline',
        alias: 'futsal',
        version: '1.2.0',
        sourceKind: 'curated',
        attributionAuthor: 'CopaLibre',
      },
    ],
  },
};

export const DiagnosticsTab: Story = {
  args: {
    activeTab: 'diagnostics',
    diagnosticsSummary: {
      status: 'healthy',
      version: '0.306.0',
      uptimeSeconds: 7200,
      sampledAt: '2026-09-28T12:00:00.000Z',
      database: { connected: true, latencyMs: 3.5, poolActive: 2, poolIdle: 8, poolWaiting: 0 },
      outbox: {
        available: true,
        pending: 5,
        processed24h: 12000,
        failed: 1,
        recentFailures: [
          {
            eventId: '019927d0-0000-7000-8000-000000000101',
            eventType: 'match.score_updated',
            attempts: 6,
            error: 'Endpoint unreachable',
            failedAt: '2026-09-28T11:59:00.000Z',
          },
        ],
      },
      storage: { connected: true, profile: 'filesystem', totalObjects: 50, totalBytes: 2048000 },
      realtime: {
        available: true,
        totalConnections: 12,
        tvKiosks: 4,
        overlays: 2,
        publicSpectators: 5,
        controlConnections: 1,
        activeReplicas: 1,
        staleReplicas: 0,
      },
    },
  },
};
