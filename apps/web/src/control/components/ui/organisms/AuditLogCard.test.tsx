import { render, screen } from '@testing-library/react';
import { AuditLogCard } from './AuditLogCard.js';

describe('the AuditLogCard organism', () => {
  const items = [
    {
      id: 'item-1',
      type: 'correction' as const,
      timestamp: '2026-09-08 20:00:00',
      actor: 'referee_1',
      action: 'Score correction applied',
      diff: {
        previous: '0 - 1',
        current: '1 - 1',
      },
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
    render(<AuditLogCard title="Audit Stream" items={items} />);

    expect(screen.getByText('Audit Stream')).not.toBeNull();
    expect(screen.getByText('referee_1')).not.toBeNull();
    expect(screen.getByText('Score correction applied')).not.toBeNull();
    expect(screen.getByText('cron_scheduler')).not.toBeNull();
  });

  it('renders score diff and latency badge on correction items', () => {
    render(<AuditLogCard items={items} />);

    expect(screen.getByText('- Score: 0 - 1')).not.toBeNull();
    expect(screen.getByText('+ Score: 1 - 1')).not.toBeNull();
    expect(screen.getByText('18ms latency')).not.toBeNull();
  });
});
