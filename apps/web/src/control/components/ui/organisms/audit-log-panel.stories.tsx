import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuditLogPanel } from './audit-log-panel.js';
import { referenceAuditTrail } from '../../../../lib/reference-fixtures.js';

const SAMPLE_ITEMS = [
  {
    id: 'evt-1',
    type: 'correction' as const,
    timestamp: '2026-09-08 22:15:04',
    actor: 'arbitro_principal',
    action: 'Dispute Resolution Overruled Match Goal',
    diff: [{ field: 'score', previous: '1 - 1', current: '2 - 1' }],
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
  title: 'Admin/Organisms/AuditLogPanel',
  component: AuditLogPanel,
} satisfies Meta<typeof AuditLogPanel>;

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

/**
 * The canonical correction — 0223's reference scenario for this predecessor.
 *
 * Two events on one match, in the order they were recorded: the table referee
 * enters 1-1, and three minutes later the tournament director corrects it to
 * 2-1 with the reason the match report gave. Told as a sequence rather than as
 * a contradiction, which is the whole difference between an audit trail and a
 * record that disagrees with itself.
 *
 * A different match from the live 3:1 beside it in the workbench, deliberately:
 * one pairing cannot hold two results at once.
 */
export const ReferenceCorrection: Story = {
  args: {
    title: 'Match operations audit trail',
    items: referenceAuditTrail().map((entry) => ({
      id: String(entry.eventNumber),
      type: entry.previous === undefined ? ('standard' as const) : ('correction' as const),
      timestamp: entry.recordedAt,
      actor: entry.actor,
      action: entry.action,
      ...(entry.previous === undefined
        ? {}
        : { diff: [{ field: 'score', previous: entry.previous, current: entry.resulting }] }),
    })),
  },
};

/**
 * The trail with nothing in it.
 *
 * A surface with no recorded activity is not a broken surface, and reviewing
 * the empty case is how that stays true.
 */
export const NothingRecorded: Story = {
  args: { title: 'Match operations audit trail', items: [] },
};
