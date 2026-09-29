import { render, screen, waitFor } from '@testing-library/react';
import { AuditTrailPage } from '../pages/AuditTrailPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { AuditTrailResponse, ControlApiClient } from '../../lib/api-client.js';

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

describe('AuditTrailPage', () => {
  it('renders applied and refused entries, each naming its actor and outcome', async () => {
    render(withIntl(<AuditTrailPage client={stubClient()} organizationAlias="liga-mendocina" />));

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
        <AuditTrailPage
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
        <AuditTrailPage
          client={stubClient({
            fetchAuditTrail: () => Promise.reject(new Error('network down')),
          })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText('network down'));
  });

  it('resolves actor IDs to user profiles when listOrganizationRoles is available', async () => {
    const roles = [
      {
        assignmentId: 'assign-alice',
        principalId: '01800000-0000-7000-8000-000000000001',
        email: 'alice@copalibre.test',
        role: 'admin' as const,
        status: 'active' as const,
      },
    ];
    const pageWithUuid = {
      records: [
        {
          auditId: 'audit-1',
          entityType: 'organization',
          entityId: 'org-1',
          action: 'organization.settings_updated',
          actor: '01800000-0000-7000-8000-000000000001',
          authorizationContext: 'copalibre.control',
          occurredAt: '2026-08-30T00:00:00.000Z',
          outcome: 'applied' as const,
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
    };

    render(
      withIntl(
        <AuditTrailPage
          client={stubClient({
            fetchAuditTrail: () => Promise.resolve(pageWithUuid),
            listOrganizationRoles: () => Promise.resolve(roles),
          })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText('alice@copalibre.test'));
    expect(screen.getByText('ID 00000001')).toBeDefined();
    expect(screen.getByText('Settings updated')).toBeDefined();
  });

  it('renders actor with email fallback when actor is an email string', async () => {
    const pageWithEmail = {
      records: [
        {
          auditId: 'audit-email',
          entityType: 'organization',
          entityId: 'org-1',
          action: 'organization.settings_updated',
          actor: 'direct@copalibre.test',
          authorizationContext: 'copalibre.control',
          occurredAt: '2026-08-30T00:00:00.000Z',
          outcome: 'applied' as const,
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
    };

    render(
      withIntl(
        <AuditTrailPage
          client={stubClient({
            fetchAuditTrail: () => Promise.resolve(pageWithEmail),
            listOrganizationRoles: () => Promise.reject(new Error('roles failed')),
          })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText('direct@copalibre.test'));
  });

  it('handles pagination navigation', async () => {
    let capturedOffset = 0;
    const page = {
      records: [
        {
          auditId: 'audit-page',
          entityType: 'organization',
          entityId: 'org-1',
          action: 'organization.settings_updated',
          actor: 'user:charlie',
          authorizationContext: '',
          occurredAt: '2026-08-30T00:00:00.000Z',
          outcome: 'applied' as const,
        },
      ],
      total: 50,
      limit: 25,
      offset: 0,
    };

    const { getByRole } = render(
      withIntl(
        <AuditTrailPage
          client={stubClient({
            fetchAuditTrail: (_alias, params) => {
              capturedOffset = params?.offset ?? 0;
              return Promise.resolve({ ...page, offset: capturedOffset });
            },
          })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText('user:charlie'));
    const nextBtn = getByRole('button', { name: /next/i });
    nextBtn.click();
    await waitFor(() => expect(capturedOffset).toBe(25));
  });
});
