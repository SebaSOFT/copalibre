import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('summarises the trail and narrows the visible page by result', () => {
    const refused: AuditRecordResponse = {
      ...baseRecord,
      auditId: 'audit-002',
      actor: 'user:dana',
      outcome: 'refused',
    };
    render(
      withIntl(
        <AuditTrailTemplate
          records={[baseRecord, refused]}
          loading={false}
          total={40}
          limit={25}
          offset={0}
          actorFilter=""
          onActorFilterChange={() => {}}
          onPreviousPage={() => {}}
          onNextPage={() => {}}
        />,
      ),
    );

    const summary = within(screen.getByRole('group', { name: 'Audit trail summary' }));
    expect(summary.getByText('40')).toBeDefined();
    expect(summary.getByText('Applied on this page')).toBeDefined();
    expect(summary.getByText('Refused on this page')).toBeDefined();
    expect(screen.getByText('2 events on this page')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Refused' }));
    expect(screen.getByText('1 event on this page')).toBeDefined();
    expect(within(screen.getByRole('table')).queryByText('Applied')).toBeNull();
  });

  it('renders clear filter button when actorFilter is provided and handles clear', () => {
    let filterValue = 'alice';
    const { rerender } = render(
      withIntl(
        <AuditTrailTemplate
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

    expect(screen.queryByText(/what this record changed/i)).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show details' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/what this record changed/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByText(/what this record changed/i)).toBeNull();
  });

  it('renders previous and next pagination buttons with correct disabled states', () => {
    let previousClicked = false;
    let nextClicked = false;

    render(
      withIntl(
        <AuditTrailTemplate
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
