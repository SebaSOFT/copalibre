import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuditLogCard } from './AuditLogCard.js';

const SAMPLE_ITEMS = [
  {
    id: 'evt-1',
    type: 'correction' as const,
    timestamp: '2026-09-08 22:15:04',
    actor: 'arbitro_principal',
    action: 'Dispute Resolution Overruled Match Goal',
    diff: {
      previous: '1 - 1',
      current: '2 - 1',
    },
    latencyMs: 14,
  },
  {
    id: 'evt-2',
    type: 'standard' as const,
    timestamp: '2026-09-08 22:10:00',
    actor: 'system_dispatcher',
    action: 'Score Ticker Telemetry Sync',
    latencyMs: 3,
  },
  {
    id: 'evt-3',
    type: 'correction' as const,
    timestamp: '2026-09-08 22:01:22',
    actor: 'operator_var',
    action: 'Penalty Card Downgrade (Red to Yellow)',
    latencyMs: 28,
  },
];

const meta = {
  title: 'Admin/Organisms/AuditLogCard',
  component: AuditLogCard,
} satisfies Meta<typeof AuditLogCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    title: 'Match Operations Audit Trail',
    items: SAMPLE_ITEMS,
  },
};

export const SingleCorrection: Story = {
  args: {
    title: 'Score Correction Event',
    items: [SAMPLE_ITEMS[0]],
  },
};
