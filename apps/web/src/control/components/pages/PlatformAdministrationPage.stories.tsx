import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { PlatformAdministrationPage } from '../pages/PlatformAdministrationPage.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { storyClient, pending, discipline } from '../screen-story-fixtures.js';

function Screen({ mode }: { readonly mode: 'loaded' | 'empty' | 'loading' | 'failed' }) {
  const intl = useIntl();
  const client = useMemo(() => {
    const empty = mode === 'empty';
    function read<T>(value: T): Promise<T> {
      if (mode === 'loading') return pending<T>();
      if (mode === 'failed')
        return Promise.reject(new Error(intl.formatMessage(messages.auditTrailLoadFailed)));
      return Promise.resolve(value);
    }
    return storyClient<ControlApiClient>({
      listDisciplines: () => read(empty ? [] : [discipline]),
      listInstallationSuperAdmins: () => read([]),
      listInstalledModules: () => read([]),
      getDiagnosticsSummary: () =>
        read({
          status: 'healthy',
          version: '0.306.0',
          uptimeSeconds: 3600,
          sampledAt: '2026-09-28T12:00:00.000Z',
          database: {
            connected: true,
            latencyMs: 2.1,
            poolActive: 1,
            poolIdle: 9,
            poolWaiting: 0,
          },
          outbox: {
            available: true,
            pending: 0,
            processed24h: 100,
            failed: 0,
            recentFailures: [],
          },
          storage: {
            connected: true,
            profile: 'filesystem',
            totalObjects: 10,
            totalBytes: 1024,
          },
          realtime: {
            available: true,
            totalConnections: 5,
            tvKiosks: 2,
            overlays: 1,
            publicSpectators: 2,
            controlConnections: 0,
            activeReplicas: 1,
            staleReplicas: 0,
          },
        }),
      retryOutboxEvents: () => read({ retried: [], skipped: [] }),
    });
  }, [mode, intl]);
  return <PlatformAdministrationPage client={client} />;
}
const meta = {
  title: 'Admin/Screens/PlatformAdministrationPage',
  component: Screen,
  args: { mode: 'loaded' },
  argTypes: { mode: { control: 'select', options: ['loaded', 'empty', 'loading', 'failed'] } },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { mode: 'empty' } };
export const Loading: Story = { args: { mode: 'loading' } };
export const Failed: Story = { args: { mode: 'failed' } };
