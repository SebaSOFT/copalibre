import { FormattedMessage, useIntl } from 'react-intl';
import type { AuditRecordResponse } from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';
import { Button } from './ui/atoms/button.js';
import { Input } from './ui/atoms/input.js';
import { FormField } from './ui/molecules/form-field.js';
import { ListScreenTemplate } from './ui/templates/list-screen-template.js';
import { DataTable, type DataTableColumn } from './ui/organisms/data-table.js';

/**
 * Read-only by design: the audit trail is inspected, never edited — there is
 * no action column, no row-level mutation, matching the accepted
 * requirement's "readable through a surface", not a management screen.
 */
export function AuditTrailPage({
  organizationAlias,
  records,
  loading,
  error,
  total,
  limit,
  offset,
  actorFilter,
  onActorFilterChange,
  onPreviousPage,
  onNextPage,
}: {
  readonly organizationAlias: string;
  readonly records: readonly AuditRecordResponse[];
  readonly loading: boolean;
  readonly error?: string;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly actorFilter: string;
  readonly onActorFilterChange: (value: string) => void;
  readonly onPreviousPage: () => void;
  readonly onNextPage: () => void;
}): React.JSX.Element {
  const intl = useIntl();

  const columns: readonly DataTableColumn<AuditRecordResponse>[] = [
    {
      key: 'occurredAt',
      header: <FormattedMessage {...messages.auditTrailColumnTime} />,
      render: (row) => <time dateTime={row.occurredAt}>{row.occurredAt}</time>,
    },
    {
      key: 'actor',
      header: <FormattedMessage {...messages.auditTrailColumnActor} />,
      render: (row) => row.actor,
    },
    {
      key: 'action',
      header: <FormattedMessage {...messages.auditTrailColumnAction} />,
      render: (row) => <code>{row.action}</code>,
    },
    {
      key: 'outcome',
      header: <FormattedMessage {...messages.auditTrailColumnOutcome} />,
      render: (row) => (
        <span className={row.outcome === 'refused' ? 'cl-state--refused' : 'cl-state--positive'}>
          <FormattedMessage
            {...(row.outcome === 'refused'
              ? messages.auditTrailOutcomeRefused
              : messages.auditTrailOutcomeApplied)}
          />
        </span>
      ),
    },
    {
      key: 'reason',
      header: <FormattedMessage {...messages.auditTrailColumnReason} />,
      render: (row) => row.reason ?? '',
    },
  ];

  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);

  return (
    <ListScreenTemplate
      title={<FormattedMessage {...messages.auditTrailTitle} />}
      breadcrumb={
        <FormattedMessage {...messages.auditTrailBreadcrumb} values={{ organizationAlias }} />
      }
      toolbar={
        <FormField
          id="audit-trail-actor-filter"
          label={intl.formatMessage(messages.auditTrailActorFilterLabel)}
        >
          <Input
            id="audit-trail-actor-filter"
            value={actorFilter}
            onChange={(event) => onActorFilterChange(event.target.value)}
          />
          {actorFilter !== '' && (
            <Button type="button" variant="secondary" onClick={() => onActorFilterChange('')}>
              <FormattedMessage {...messages.auditTrailActorFilterClear} />
            </Button>
          )}
        </FormField>
      }
      listing={
        loading ? (
          <p>
            <FormattedMessage {...messages.auditTrailLoading} />
          </p>
        ) : error !== undefined ? (
          <p role="alert">{error}</p>
        ) : (
          <DataTable
            columns={columns}
            rows={records}
            rowKey={(row) => row.auditId}
            emptyMessage={intl.formatMessage(messages.auditTrailEmpty)}
            ariaLabel={intl.formatMessage(messages.auditTrailTitle)}
          />
        )
      }
      pagination={
        !loading && error === undefined && total > 0 ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={offset === 0}
              onClick={onPreviousPage}
            >
              <FormattedMessage {...messages.auditTrailPreviousPage} />
            </Button>
            <span>
              <FormattedMessage {...messages.auditTrailPageStatus} values={{ start, end, total }} />
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={offset + limit >= total}
              onClick={onNextPage}
            >
              <FormattedMessage {...messages.auditTrailNextPage} />
            </Button>
          </>
        ) : undefined
      }
    />
  );
}
