import { useId, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type {
  DiagnosticsDatabase,
  DiagnosticsFailure,
  DiagnosticsOutbox,
  DiagnosticsRealtime,
  DiagnosticsStorage,
  DiagnosticsSummary,
} from '@copalibre/contracts';
import { messages } from '../../i18n/messages.en.js';
import { Badge } from '../ui/atoms/badge.js';
import { Button } from '../ui/atoms/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/atoms/card.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Label } from '../ui/atoms/label.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';
import { Modal } from '../ui/organisms/modal.js';
import { MetricStrip, type MetricStripEntry } from '../ui/molecules/metric-strip.js';
import { TableToolbar } from '../ui/molecules/table-toolbar.js';

export interface PlatformDiagnosticsScreenProps {
  readonly summary?: DiagnosticsSummary;
  readonly loading: boolean;
  readonly error?: string;
  readonly autoPoll: boolean;
  readonly onToggleAutoPoll: (enabled: boolean) => void;
  readonly onRefresh: () => Promise<void>;
  readonly onRetryEvents: (eventIds: readonly string[]) => Promise<void>;
  readonly retrying?: boolean;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function DatabaseDiagnosticsCard({
  database,
}: {
  readonly database: DiagnosticsDatabase;
}): React.JSX.Element {
  return (
    <Card aria-labelledby="platform-diagnostics-db-heading" role="region">
      <CardHeader>
        <CardTitle id="platform-diagnostics-db-heading">
          <FormattedMessage {...messages.platformDiagnosticsDatabase} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="cl-role-status">
          <span>
            <FormattedMessage
              {...messages.platformDiagnosticsDbLatency}
              values={{ ms: database.latencyMs }}
            />
          </span>
          <span>
            <FormattedMessage
              {...messages.platformDiagnosticsDbPool}
              values={{
                active: database.poolActive ?? 0,
                idle: database.poolIdle ?? 0,
                waiting: database.poolWaiting ?? 0,
              }}
            />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StorageDiagnosticsCard({
  storage,
}: {
  readonly storage: DiagnosticsStorage;
}): React.JSX.Element {
  const statusMessage = storage.connected
    ? messages.platformDiagnosticsStorageConnected
    : messages.platformDiagnosticsStorageDisconnected;
  return (
    <Card aria-labelledby="platform-diagnostics-storage-heading" role="region">
      <CardHeader>
        <CardTitle id="platform-diagnostics-storage-heading">
          <FormattedMessage {...messages.platformDiagnosticsStorage} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="cl-role-status">
          <span>
            <FormattedMessage {...statusMessage} values={{ profile: storage.profile }} />
          </span>
          <span>
            <FormattedMessage
              {...messages.platformDiagnosticsStorageObjects}
              values={{ count: storage.totalObjects ?? 0 }}
            />
          </span>
          <span>
            <FormattedMessage
              {...messages.platformDiagnosticsStorageBytes}
              values={{ bytes: formatBytes(storage.totalBytes) }}
            />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function OutboxDiagnosticsCard({
  outbox,
}: {
  readonly outbox: DiagnosticsOutbox;
}): React.JSX.Element {
  return (
    <Card aria-labelledby="platform-diagnostics-outbox-heading" role="region">
      <CardHeader>
        <CardTitle id="platform-diagnostics-outbox-heading">
          <FormattedMessage {...messages.platformDiagnosticsOutbox} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="cl-role-status">
          <span>
            <FormattedMessage
              {...messages.platformDiagnosticsOutboxPending}
              values={{ count: outbox.pending ?? 0 }}
            />
          </span>
          <span>
            <FormattedMessage
              {...messages.platformDiagnosticsOutboxProcessed}
              values={{ count: outbox.processed24h ?? 0 }}
            />
          </span>
          <span>
            <FormattedMessage
              {...messages.platformDiagnosticsOutboxFailed}
              values={{ count: outbox.failed ?? 0 }}
            />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function RealtimeDiagnosticsCard({
  realtime,
}: {
  readonly realtime: DiagnosticsRealtime;
}): React.JSX.Element {
  return (
    <Card aria-labelledby="platform-diagnostics-realtime-heading" role="region">
      <CardHeader>
        <CardTitle id="platform-diagnostics-realtime-heading">
          <FormattedMessage {...messages.platformDiagnosticsRealtime} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="cl-role-status">
          {realtime.available ? (
            <>
              <span>
                <FormattedMessage
                  {...messages.platformDiagnosticsRealtimeActive}
                  values={{ count: realtime.totalConnections ?? 0 }}
                />
              </span>
              <span>
                <FormattedMessage
                  {...messages.platformDiagnosticsRealtimeBreakdown}
                  values={{
                    kiosks: realtime.tvKiosks ?? 0,
                    overlays: realtime.overlays ?? 0,
                    spectators: realtime.publicSpectators ?? 0,
                    control: realtime.controlConnections ?? 0,
                  }}
                />
              </span>
              <span>
                <FormattedMessage
                  {...messages.platformDiagnosticsRealtimeReplicas}
                  values={{
                    active: realtime.activeReplicas ?? 0,
                    stale: realtime.staleReplicas ?? 0,
                  }}
                />
              </span>
            </>
          ) : (
            <p>
              <FormattedMessage {...messages.platformDiagnosticsRealtimeUnavailable} />
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OutboxFailuresCard({
  failures,
  onRetryEvents,
  retrying,
}: {
  readonly failures: readonly DiagnosticsFailure[];
  readonly onRetryEvents: (eventIds: readonly string[]) => Promise<void>;
  readonly retrying: boolean;
}): React.JSX.Element {
  const intl = useIntl();
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const allSelected = failures.length > 0 && failures.every((f) => selectedIds.includes(f.eventId));

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(failures.map((f) => f.eventId));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleConfirmRetry = async () => {
    await onRetryEvents(selectedIds);
    setSelectedIds([]);
    setModalOpen(false);
  };

  const failureColumns: readonly DataTableColumn<DiagnosticsFailure>[] = [
    {
      key: 'select',
      header: (
        <Checkbox
          aria-label={intl.formatMessage(messages.platformDiagnosticsSelectAllEvents)}
          checked={allSelected}
          onCheckedChange={toggleSelectAll}
        />
      ),
      render: (failure) => (
        <Checkbox
          aria-label={intl.formatMessage(messages.platformDiagnosticsSelectEvent, {
            id: failure.eventId,
          })}
          checked={selectedIds.includes(failure.eventId)}
          onCheckedChange={(checked) => toggleSelectOne(failure.eventId, checked)}
        />
      ),
    },
    {
      key: 'eventId',
      header: <FormattedMessage {...messages.platformDiagnosticsColEventId} />,
      render: (failure) => <code>{failure.eventId}</code>,
    },
    {
      key: 'eventType',
      header: <FormattedMessage {...messages.platformDiagnosticsColEventType} />,
      render: (failure) => <strong>{failure.eventType}</strong>,
    },
    {
      key: 'attempts',
      header: <FormattedMessage {...messages.platformDiagnosticsColAttempts} />,
      render: (failure) => failure.attempts,
    },
    {
      key: 'error',
      header: <FormattedMessage {...messages.platformDiagnosticsColError} />,
      render: (failure) => failure.error,
    },
    {
      key: 'failedAt',
      header: <FormattedMessage {...messages.platformDiagnosticsColFailedAt} />,
      render: (failure) => failure.failedAt,
    },
  ];

  return (
    <Card aria-labelledby="platform-diagnostics-failures-heading" role="region">
      <CardHeader>
        <CardTitle id="platform-diagnostics-failures-heading">
          <FormattedMessage {...messages.platformDiagnosticsFailuresHeading} />
        </CardTitle>
        <CardDescription>
          <FormattedMessage {...messages.platformDiagnosticsFailuresDescription} />
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failures.length === 0 ? (
          <p>
            <FormattedMessage {...messages.platformDiagnosticsNoFailures} />
          </p>
        ) : (
          <>
            <div className="cl-table-toolbar">
              <div className="cl-table-toolbar__actions">
                <Button
                  disabled={selectedIds.length === 0 || retrying}
                  onClick={() => setModalOpen(true)}
                  type="button"
                  variant="primary"
                >
                  <FormattedMessage {...messages.platformDiagnosticsRetrySelected} />
                </Button>
              </div>
            </div>
            <DataTable
              ariaLabel={intl.formatMessage(messages.platformDiagnosticsFailuresHeading)}
              columns={failureColumns}
              emptyMessage={intl.formatMessage(messages.platformDiagnosticsNoFailures)}
              rowKey={(f) => f.eventId}
              rows={failures}
            />
          </>
        )}
      </CardContent>

      <Modal
        closeLabel={intl.formatMessage(messages.platformDiagnosticsRetryModalClose)}
        description={intl.formatMessage(messages.platformDiagnosticsRetryModalDescription, {
          count: selectedIds.length,
        })}
        footer={
          <div className="cl-table-toolbar__actions">
            <Button
              disabled={retrying}
              onClick={() => setModalOpen(false)}
              type="button"
              variant="secondary"
            >
              <FormattedMessage {...messages.platformDiagnosticsRetryCancel} />
            </Button>
            <Button
              disabled={retrying}
              onClick={() => void handleConfirmRetry()}
              type="button"
              variant="primary"
            >
              <FormattedMessage {...messages.platformDiagnosticsRetryConfirm} />
            </Button>
          </div>
        }
        onOpenChange={setModalOpen}
        open={modalOpen}
        title={intl.formatMessage(messages.platformDiagnosticsRetryModalTitle)}
      >
        <div className="cl-screen-sections">
          {selectedIds.map((id) => (
            <div key={id}>
              <code>{id}</code>
            </div>
          ))}
        </div>
      </Modal>
    </Card>
  );
}

function buildOverviewMetrics(
  summary: DiagnosticsSummary,
  intl: ReturnType<typeof useIntl>,
): readonly MetricStripEntry[] {
  return [
    {
      key: 'database',
      label: intl.formatMessage(messages.platformDiagnosticsDatabase),
      value: summary.database.connected
        ? intl.formatMessage(messages.platformDiagnosticsDbConnected)
        : intl.formatMessage(messages.platformDiagnosticsDbDisconnected),
      description: intl.formatMessage(messages.platformDiagnosticsDbLatency, {
        ms: summary.database.latencyMs,
      }),
    },
    {
      key: 'outbox',
      label: intl.formatMessage(messages.platformDiagnosticsOutbox),
      value: summary.outbox.pending ?? 0,
      description: intl.formatMessage(messages.platformDiagnosticsOutboxFailed, {
        count: summary.outbox.failed ?? 0,
      }),
    },
    {
      key: 'storage',
      label: intl.formatMessage(messages.platformDiagnosticsStorage),
      value: summary.storage.connected
        ? intl.formatMessage(messages.platformDiagnosticsStorageConnected, {
            profile: summary.storage.profile,
          })
        : intl.formatMessage(messages.platformDiagnosticsStorageDisconnected, {
            profile: summary.storage.profile,
          }),
      description: intl.formatMessage(messages.platformDiagnosticsStorageObjects, {
        count: summary.storage.totalObjects ?? 0,
      }),
    },
    {
      key: 'realtime',
      label: intl.formatMessage(messages.platformDiagnosticsRealtime),
      value: summary.realtime.available ? (summary.realtime.totalConnections ?? 0) : undefined,
      unavailableLabel: intl.formatMessage(messages.platformDiagnosticsRealtimeUnavailable),
      description: summary.realtime.available
        ? intl.formatMessage(messages.platformDiagnosticsRealtimeReplicas, {
            active: summary.realtime.activeReplicas ?? 0,
            stale: summary.realtime.staleReplicas ?? 0,
          })
        : undefined,
    },
  ];
}

export function PlatformDiagnosticsScreen({
  summary,
  loading,
  error,
  autoPoll,
  onToggleAutoPoll,
  onRefresh,
  onRetryEvents,
  retrying = false,
}: PlatformDiagnosticsScreenProps): React.JSX.Element {
  const intl = useIntl();
  const autoPollId = useId();

  if (loading && !summary) {
    return (
      <div className="cl-screen-sections">
        <p>
          <FormattedMessage {...messages.platformDiagnosticsLoading} />
        </p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="cl-screen-sections">
        {error ? (
          <div className="cl-form__error" role="alert">
            {error}
          </div>
        ) : (
          <p>
            <FormattedMessage {...messages.platformDiagnosticsLoading} />
          </p>
        )}
      </div>
    );
  }

  const hours = Math.floor(summary.uptimeSeconds / 3600);
  const minutes = Math.floor((summary.uptimeSeconds % 3600) / 60);

  const statusLabel =
    summary.status === 'healthy'
      ? intl.formatMessage(messages.platformDiagnosticsHealthy)
      : summary.status === 'degraded'
        ? intl.formatMessage(messages.platformDiagnosticsDegraded)
        : intl.formatMessage(messages.platformDiagnosticsCritical);

  const overviewMetrics = buildOverviewMetrics(summary, intl);

  return (
    <div className="cl-screen-sections">
      {error ? (
        <div className="cl-form__error" role="alert">
          {error}
        </div>
      ) : null}

      <TableToolbar
        actions={
          <div className="cl-table-toolbar__actions">
            <div className="cl-table-toolbar__filters">
              <Checkbox checked={autoPoll} id={autoPollId} onCheckedChange={onToggleAutoPoll} />
              <Label htmlFor={autoPollId}>
                <FormattedMessage {...messages.platformDiagnosticsAutoPoll} />
              </Label>
            </div>
            <Button
              disabled={loading}
              onClick={() => void onRefresh()}
              type="button"
              variant="secondary"
            >
              <FormattedMessage {...messages.platformDiagnosticsRefresh} />
            </Button>
          </div>
        }
        title={intl.formatMessage(messages.platformDiagnosticsHeading)}
      >
        <div className="cl-table-toolbar__filters">
          <Badge dot label={statusLabel} />
          <span className="cl-metric-strip__label">
            <FormattedMessage {...messages.platformDiagnosticsUptime} values={{ hours, minutes }} />
          </span>
          <span className="cl-metric-strip__label">
            <FormattedMessage
              {...messages.platformDiagnosticsVersion}
              values={{ version: summary.version }}
            />
          </span>
        </div>
      </TableToolbar>

      <MetricStrip
        ariaLabel={intl.formatMessage(messages.platformDiagnosticsHeading)}
        metrics={overviewMetrics}
      />

      <DatabaseDiagnosticsCard database={summary.database} />
      <StorageDiagnosticsCard storage={summary.storage} />
      <OutboxDiagnosticsCard outbox={summary.outbox} />
      <RealtimeDiagnosticsCard realtime={summary.realtime} />
      <OutboxFailuresCard
        failures={summary.outbox.recentFailures ?? []}
        onRetryEvents={onRetryEvents}
        retrying={retrying}
      />
    </div>
  );
}
