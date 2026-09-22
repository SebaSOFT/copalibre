import { render, screen } from '@testing-library/react';
import { AuditTrailTemplate } from './AuditTrailTemplate.js';
import { withIntl } from '../../i18n/test-support.js';
import type { AuditRecordResponse } from '../../lib/api-client.js';

describe('AuditTrailTemplate', () => {
  const baseRecord: AuditRecordResponse = {
    auditId: 'audit-001',
    entityType: 'organization',
    entityId: 'org-1',
    action: 'organization.settings_updated',
    actor: 'user:charlie',
    authorizationContext: 'copalibre.control',
    occurredAt: '2026-08-30T10:00:00.000Z',
    outcome: 'applied',
  };

  it('renders loading state', () => {
    render(
      withIntl(
        <AuditTrailTemplate
          organizationAlias="test-org"
          records={[]}
          loading={true}
          total={0}
          limit={25}
          offset={0}
          actorFilter=""
          onActorFilterChange={() => {}}
          onPreviousPage={() => {}}
          onNextPage={() => {}}
        />,
      ),
    );

    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it('renders error state', () => {
    render(
      withIntl(
        <AuditTrailTemplate
          organizationAlias="test-org"
          records={[]}
          loading={false}
          error="Failed to load trail"
          total={0}
          limit={25}
          offset={0}
          actorFilter=""
          onActorFilterChange={() => {}}
          onPreviousPage={() => {}}
          onNextPage={() => {}}
        />,
      ),
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Failed to load trail')).toBeDefined();
  });

  it('renders clear filter button when actorFilter is provided and handles clear', () => {
    let filterValue = 'alice';
    const { rerender } = render(
      withIntl(
        <AuditTrailTemplate
          organizationAlias="test-org"
          records={[baseRecord]}
          loading={false}
          total={1}
          limit={25}
          offset={0}
          actorFilter={filterValue}
          onActorFilterChange={(val) => {
            filterValue = val;
          }}
          onPreviousPage={() => {}}
          onNextPage={() => {}}
        />,
      ),
    );

    const clearButton = screen.getByRole('button', { name: /clear/i });
    expect(clearButton).toBeDefined();
    clearButton.click();
    expect(filterValue).toBe('');

    rerender(
      withIntl(
        <AuditTrailTemplate
          organizationAlias="test-org"
          records={[baseRecord]}
          loading={false}
          total={1}
          limit={25}
          offset={0}
          actorFilter=""
          onActorFilterChange={() => {}}
          onPreviousPage={() => {}}
          onNextPage={() => {}}
        />,
      ),
    );

    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
  });

  it('renders row detail with AuditLogPanel for records with corrections', () => {
    const correctionRecord: AuditRecordResponse = {
      ...baseRecord,
      auditId: 'audit-corr-1',
      previousState: { name: 'Old Org' },
      resultingState: { name: 'New Org' },
    };

    render(
      withIntl(
        <AuditTrailTemplate
          organizationAlias="test-org"
          records={[correctionRecord]}
          loading={false}
          total={1}
          limit={25}
          offset={0}
          actorFilter=""
          onActorFilterChange={() => {}}
          onPreviousPage={() => {}}
          onNextPage={() => {}}
        />,
      ),
    );

    expect(screen.getByText(/what this record changed/i)).toBeDefined();
  });

  it('renders previous and next pagination buttons with correct disabled states', () => {
    let previousClicked = false;
    let nextClicked = false;

    render(
      withIntl(
        <AuditTrailTemplate
          organizationAlias="test-org"
          records={[baseRecord]}
          loading={false}
          total={75}
          limit={25}
          offset={25}
          actorFilter=""
          onActorFilterChange={() => {}}
          onPreviousPage={() => {
            previousClicked = true;
          }}
          onNextPage={() => {
            nextClicked = true;
          }}
        />,
      ),
    );

    const prevButton = screen.getByRole('button', { name: /previous/i });
    const nextButton = screen.getByRole('button', { name: /next/i });

    expect(prevButton.hasAttribute('disabled')).toBe(false);
    expect(nextButton.hasAttribute('disabled')).toBe(false);

    prevButton.click();
    expect(previousClicked).toBe(true);

    nextButton.click();
    expect(nextClicked).toBe(true);
  });
});
