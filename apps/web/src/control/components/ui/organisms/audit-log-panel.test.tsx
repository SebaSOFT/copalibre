import { render, screen } from '@testing-library/react';
import { AuditLogPanel } from './audit-log-panel.js';
import { withIntl } from '../../../i18n/test-support.js';

describe('the AuditLogPanel organism', () => {
  const items = [
    {
      id: 'item-1',
      type: 'correction' as const,
      timestamp: '2026-09-08 20:00:00',
      actor: 'referee_1',
      action: 'Score correction applied',
      diff: [{ field: 'score', previous: '0 - 1', current: '1 - 1' }],
      latencyMs: 18,
    },
    {
      id: 'item-2',
      type: 'standard' as const,
      timestamp: '2026-09-08 20:05:00',
      actor: 'cron_scheduler',
      action: 'Clock tick synced',
    },
  ];

  it('renders title, events list, and actor metadata', () => {
    render(withIntl(<AuditLogPanel title="Audit Stream" items={items} />));

    expect(screen.getByText('Audit Stream')).not.toBeNull();
    expect(screen.getByText('referee_1')).not.toBeNull();
    expect(screen.getByText('Score correction applied')).not.toBeNull();
    expect(screen.getByText('cron_scheduler')).not.toBeNull();
  });

  it('renders score diff and latency badge on correction items', () => {
    render(withIntl(<AuditLogPanel title="Audit Stream" items={items} />));

    expect(screen.getByText('- score: 0 - 1')).not.toBeNull();
    expect(screen.getByText('+ score: 1 - 1')).not.toBeNull();
    expect(screen.getByText('18ms latency')).not.toBeNull();
  });

  it('renders one row per changed field, each named for itself — a reschedule names both fields, never a field the record does not contain', () => {
    render(
      withIntl(
        <AuditLogPanel
          title="Audit Stream"
          items={[
            {
              id: 'item-3',
              type: 'correction' as const,
              timestamp: '2026-09-08 20:10:00',
              actor: 'tournament_director',
              action: 'Match rescheduled',
              diff: [
                { field: 'startTime', previous: '18:00', current: '19:00' },
                { field: 'venue', previous: 'Court 1', current: 'Court 2' },
              ],
            },
          ]}
        />,
      ),
    );

    expect(screen.getByText('- startTime: 18:00')).not.toBeNull();
    expect(screen.getByText('+ startTime: 19:00')).not.toBeNull();
    expect(screen.getByText('- venue: Court 1')).not.toBeNull();
    expect(screen.getByText('+ venue: Court 2')).not.toBeNull();
    expect(screen.queryByText(/Score/)).toBeNull();
  });
});
