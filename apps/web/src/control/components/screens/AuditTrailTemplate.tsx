import { useContext, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { AuditRecordResponse } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { Button } from '../ui/atoms/button.js';
import { Badge } from '../ui/atoms/badge.js';
import { PageHeaderTemplate } from './PageHeaderTemplate.js';
import { FilterBar } from '../ui/organisms/filter-bar.js';
import { KpiStrip } from '../ui/organisms/kpi-strip.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';
import { AuditLogPanel } from '../ui/organisms/audit-log-panel.js';
import { toAuditLogItem } from '../../lib/audit-log.js';
import { ResponsiveTimestamp } from '../../../components/ui/atoms/ResponsiveTimestamp.js';
import { EntityIdentityCell } from '../ui/molecules/entity-identity-cell.js';
import { formatActivityAction, formatActivityReason } from '../../lib/activity-formatting.js';
import { formatActor } from '../../lib/presentation-formatting.js';
import { CopyIdButton } from '../ui/atoms/copy-id-button.js';
import { PageHeaderContext } from '../ui/organisms/page-header.js';

export interface AuditActorProfile {
  readonly email: string;
  readonly role?: string;
  readonly principalId?: string;
}

/**
 * Read-only by design: the audit trail is inspected, never edited — there is
 * no action column, no row-level mutation, matching the accepted
 * requirement's "readable through a surface", not a management screen.
 */
export function AuditTrailTemplate({
  records,
  actors,
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
  readonly records: readonly AuditRecordResponse[];
  readonly actors?: Readonly<Record<string, AuditActorProfile>>;
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
  const pageHeader = useContext(PageHeaderContext);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = (auditId: string): void =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(auditId)) next.add(auditId);
      return next;
    });
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | AuditRecordResponse['outcome']>('all');
  const appliedCount = records.filter((record) => record.outcome === 'applied').length;
  const refusedCount = records.length - appliedCount;
  const visibleRecords =
    outcomeFilter === 'all'
      ? records
      : records.filter((record) => record.outcome === outcomeFilter);

  const columns: readonly DataTableColumn<AuditRecordResponse>[] = [
    {
      key: 'occurredAt',
      label: intl.formatMessage(messages.auditTrailColumnTime),
      header: <FormattedMessage {...messages.auditTrailColumnTime} />,
      render: (row) => (
        <ResponsiveTimestamp
          locale={intl.locale}
          timeZone={pageHeader?.organizationTimeZone}
          timestamp={row.occurredAt}
        />
      ),
    },
    {
      key: 'actor',
      label: intl.formatMessage(messages.auditTrailColumnActor),
      header: <FormattedMessage {...messages.auditTrailColumnActor} />,
      render: (row) => {
        const actorProfile = actors?.[row.actor];
        if (actorProfile) {
          return <EntityIdentityCell email={actorProfile.email} />;
        }
        if (row.actor.includes('@')) {
          return <EntityIdentityCell email={row.actor} />;
        }
        return <span>{formatActor(intl, row.actor)}</span>;
      },
    },
    {
      key: 'action',
      label: intl.formatMessage(messages.auditTrailColumnAction),
      header: <FormattedMessage {...messages.auditTrailColumnAction} />,
      render: (row) => (
        <Badge label={formatActivityAction(row.action, intl.locale)} variant="section" />
      ),
    },
    {
      key: 'outcome',
      label: intl.formatMessage(messages.auditTrailColumnOutcome),
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
      label: intl.formatMessage(messages.auditTrailColumnReason),
      header: <FormattedMessage {...messages.auditTrailColumnReason} />,
      render: (row) => formatActivityReason(row.reason, intl.locale),
    },
    {
      key: 'details',
      label: intl.formatMessage(messages.auditTrailColumnDetails),
      header: <FormattedMessage {...messages.auditTrailColumnDetails} />,
      render: (row) => (
        <Button
          aria-expanded={expanded.has(row.auditId)}
          onClick={() => toggleExpanded(row.auditId)}
          type="button"
          variant="secondary"
        >
          {intl.formatMessage(
            expanded.has(row.auditId)
              ? messages.auditTrailHideDetails
              : messages.auditTrailShowDetails,
          )}
        </Button>
      ),
    },
  ];

  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);

  return (
    <PageHeaderTemplate
      description={<FormattedMessage {...messages.auditTrailDescription} />}
      title={<FormattedMessage {...messages.auditTrailTitle} />}
    >
      <div className="cl-operations__listing">
        <KpiStrip
          ariaLabel={intl.formatMessage(messages.auditTrailKpiLabel)}
          metrics={[
            {
              key: 'events',
              label: intl.formatMessage(messages.auditTrailKpiEvents),
              sourceField: 'events',
              formatValue: (value) => String(value),
            },
            {
              key: 'applied',
              label: intl.formatMessage(messages.auditTrailKpiApplied),
              sourceField: 'applied',
              formatValue: (value) => String(value),
            },
            {
              key: 'refused',
              label: intl.formatMessage(messages.auditTrailKpiRefused),
              sourceField: 'refused',
              formatValue: (value) => String(value),
            },
          ]}
          source={{ events: total, applied: appliedCount, refused: refusedCount }}
        />
        <FilterBar
          filtersLabel={intl.formatMessage(messages.auditTrailFiltersLabel)}
          onOptionChange={(id) =>
            setOutcomeFilter(id === 'all' ? 'all' : (id as 'applied' | 'refused'))
          }
          onSearchChange={onActorFilterChange}
          options={[
            {
              id: 'all',
              label: intl.formatMessage(messages.auditTrailFilterAll),
              count: records.length,
            },
            {
              id: 'applied',
              label: intl.formatMessage(messages.auditTrailOutcomeApplied),
              count: appliedCount,
            },
            {
              id: 'refused',
              label: intl.formatMessage(messages.auditTrailOutcomeRefused),
              count: refusedCount,
            },
          ]}
          resultCount={intl.formatMessage(messages.auditTrailResultCount, {
            count: visibleRecords.length,
          })}
          searchId="audit-trail-actor-filter"
          searchLabel={intl.formatMessage(messages.auditTrailActorFilterLabel)}
          searchValue={actorFilter}
          selectedOptionId={outcomeFilter}
        />
        {actorFilter !== '' && (
          <div>
            <Button type="button" variant="secondary" onClick={() => onActorFilterChange('')}>
              <FormattedMessage {...messages.auditTrailActorFilterClear} />
            </Button>
          </div>
        )}
        {loading ? (
          <p>
            <FormattedMessage {...messages.auditTrailLoading} />
          </p>
        ) : error !== undefined ? (
          <p role="alert">{error}</p>
        ) : (
          <DataTable
            columns={columns}
            rows={visibleRecords}
            mobileMode="stacked"
            rowKey={(row) => row.auditId}
            emptyMessage={intl.formatMessage(messages.auditTrailEmpty)}
            ariaLabel={intl.formatMessage(messages.auditTrailTitle)}
            /*
              The ledger entry for a record that changed something: the fields
              that actually differ, before and after. Only where the record
              carries both states — a record with no previous state is not a
              correction, and is not dressed as one. Nothing is fetched or
              revealed here that the row above did not already carry to this
              authorized surface.
            */
            renderRowDetail={(row) =>
              !expanded.has(row.auditId) ? undefined : (
                <div className="cl-screen-sections">
                  <div className="cl-role-user">
                    <CopyIdButton
                      label={intl.formatMessage(messages.auditCopyEntityId)}
                      copiedLabel={intl.formatMessage(messages.copyIdSuccess)}
                      failedLabel={intl.formatMessage(messages.copyIdFailure)}
                      value={row.entityId}
                    />
                    <CopyIdButton
                      label={intl.formatMessage(messages.auditCopyActorId)}
                      copiedLabel={intl.formatMessage(messages.copyIdSuccess)}
                      failedLabel={intl.formatMessage(messages.copyIdFailure)}
                      value={actors?.[row.actor]?.principalId ?? row.actor}
                    />
                  </div>
                  {row.previousState !== undefined && row.resultingState !== undefined && (
                    <AuditLogPanel
                      items={[toAuditLogItem(row)]}
                      title={intl.formatMessage(messages.auditTrailCorrectionTitle)}
                      timeZone={pageHeader?.organizationTimeZone}
                    />
                  )}
                </div>
              )
            }
          />
        )}
        {!loading && error === undefined && total > 0 && (
          <div className="cl-list-screen__pagination">
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
          </div>
        )}
      </div>
    </PageHeaderTemplate>
  );
}
