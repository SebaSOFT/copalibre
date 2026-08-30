import { render, screen, waitFor } from '@testing-library/react';
import { AuditTrailRoute } from './AuditTrailRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { AuditTrailResponse, ControlApiClient } from '../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  const page: AuditTrailResponse = {
    records: [
      {
        auditId: 'audit-1',
        entityType: 'organization',
        entityId: 'org-1',
        action: 'organization.settings_updated',
        actor: 'user:alice',
        authorizationContext: 'copalibre.control',
        occurredAt: '2026-08-30T00:00:00.000Z',
        outcome: 'applied',
      },
      {
        auditId: 'audit-2',
        entityType: 'organization',
        entityId: 'org-1',
        action: 'authorization.refused',
        actor: 'user:bob',
        authorizationContext: '',
        reason: 'Subject organization role is not authorized for this route',
        occurredAt: '2026-08-29T00:00:00.000Z',
        outcome: 'refused',
      },
    ],
    total: 2,
    limit: 25,
    offset: 0,
  };
  return {
    fetchAuditTrail: () => Promise.resolve(page),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('AuditTrailRoute', () => {
  it('renders applied and refused entries, each naming its actor and outcome', async () => {
    render(withIntl(<AuditTrailRoute client={stubClient()} organizationAlias="liga-mendocina" />));

    await waitFor(() => screen.getByText('user:alice'));
    expect(screen.getByRole('heading', { level: 1, name: /audit trail/i })).toBeDefined();
    expect(screen.getByText('user:bob')).toBeDefined();
    expect(screen.getByText('Applied')).toBeDefined();
    expect(screen.getByText('Refused')).toBeDefined();
    expect(
      screen.getByText('Subject organization role is not authorized for this route'),
    ).toBeDefined();
  });

  it('shows an empty state when the trail has nothing recorded', async () => {
    render(
      withIntl(
        <AuditTrailRoute
          client={stubClient({
            fetchAuditTrail: () => Promise.resolve({ records: [], total: 0, limit: 25, offset: 0 }),
          })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText(/nothing recorded yet/i));
  });

  it('surfaces a load failure rather than silently showing nothing', async () => {
    render(
      withIntl(
        <AuditTrailRoute
          client={stubClient({
            fetchAuditTrail: () => Promise.reject(new Error('network down')),
          })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText('network down'));
  });
});
