import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { ActivityLog } from './ActivityLog.js';
import { withIntl } from '../i18n/test-support.js';
import type { ActivityEntry } from '../lib/dashboard.js';
import { messages as spanishMessages } from '../i18n/messages.es.js';

describe('ActivityLog', () => {
  const baseTime = new Date('2026-09-04T12:00:00.000Z').getTime();

  it('renders empty state when there are no activity entries', () => {
    render(withIntl(<ActivityLog entries={[]} />));
    expect(screen.getByText('No activity yet.')).toBeDefined();
  });

  it('renders activity entries with human-readable actors, actions, and reason', () => {
    const entries: readonly ActivityEntry[] = [
      {
        auditId: 'audit-1',
        organizationId: 'org-1',
        action: 'match.finalized',
        actor: 'user:admin-1',
        occurredAt: new Date(baseTime - 120_000).toISOString(),
        reason: 'Finalized by supervisor review',
      },
      {
        auditId: 'audit-2',
        organizationId: 'org-1',
        action: 'club.created',
        actor: 'user:staff-2',
        occurredAt: new Date(baseTime - 3600_000).toISOString(),
      },
    ];

    render(withIntl(<ActivityLog entries={entries} now={baseTime} />));

    expect(screen.getByText('Match finalized')).toBeDefined();
    expect(screen.getByText('Finalized by supervisor review')).toBeDefined();

    expect(screen.getByText('Club created')).toBeDefined();
    expect(screen.getAllByText('User')).toHaveLength(2);
    expect(screen.queryByText(/match\.finalized|club\.created|user:(admin|staff)-\d/)).toBeNull();
  });

  it('translates recorded match activity and its reason into Spanish', () => {
    const entry: ActivityEntry = {
      auditId: 'audit-recorded',
      organizationId: 'org-1',
      action: 'event.recorded',
      actor: 'user:admin-1',
      occurredAt: new Date(baseTime - 120_000).toISOString(),
      reason: 'match finalized from recorded facts',
    };

    render(
      <IntlProvider locale="es" messages={spanishMessages}>
        <ActivityLog entries={[entry]} now={baseTime} />
      </IntlProvider>,
    );

    expect(screen.getByText('Evento registrado')).toBeDefined();
    expect(screen.getByText('Partido finalizado a partir de los hechos registrados')).toBeDefined();
  });

  it('uses default now timestamp when now prop is omitted', () => {
    const entries: readonly ActivityEntry[] = [
      {
        auditId: 'audit-3',
        organizationId: 'org-1',
        action: 'team.created',
        actor: 'user:admin-1',
        occurredAt: new Date().toISOString(),
      },
    ];

    render(withIntl(<ActivityLog entries={entries} />));
    expect(screen.getByText('Team created')).toBeDefined();
    expect(screen.getByText('just now')).toBeDefined();
  });
});
