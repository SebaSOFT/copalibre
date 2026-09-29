import { useIntl } from 'react-intl';
import { messages } from '../../../i18n/messages.en.js';
import { auditFieldLabel } from '../../../lib/audit-log.js';
import { ResponsiveTimestamp } from '../../../../components/ui/atoms/ResponsiveTimestamp.js';
import { Stack } from '../atoms/layout/stack.js';
import { Inline } from '../atoms/layout/inline.js';

export interface AuditDiffField {
  /** The record's own field name — never a fixed label, since a correction may change any field. */
  readonly field: string;
  readonly previous: string;
  readonly current: string;
}

export type AuditDiff = readonly AuditDiffField[];

export interface AuditLogItem {
  readonly id: string;
  readonly type: 'correction' | 'standard';
  readonly timestamp: string;
  readonly actor: string;
  readonly action: string;
  readonly diff?: AuditDiff;
  readonly latencyMs?: number;
}

export interface AuditLogPanelProps {
  readonly title: string;
  readonly items: readonly AuditLogItem[];
  readonly className?: string;
}

export function AuditLogPanel({
  title,
  items,
  className = '',
}: AuditLogPanelProps): React.JSX.Element {
  const intl = useIntl();
  return (
    <div className={`cl-audit-log-panel cl-chamfer cl-chamfer--control ${className}`.trim()}>
      <div className="cl-audit-log-panel__header">
        <Inline align="center" gap="2" justify="between" wrap>
          <h3 className="cl-audit-log-panel__title">{title}</h3>
          <span className="cl-audit-log-panel__count">
            {intl.formatMessage(messages.auditLogPanelEventCount, { count: items.length })}
          </span>
        </Inline>
      </div>

      <Stack gap="3">
        {items.map((item) => {
          const isCorrection = item.type === 'correction';

          return (
            <div
              key={item.id}
              className={`cl-audit-log-panel__item cl-accent-rail ${
                isCorrection
                  ? 'cl-audit-log-panel__item--correction cl-accent-rail--correction'
                  : 'cl-accent-rail--neutral'
              }`}
            >
              <div className="cl-audit-log-panel__meta">
                <Inline align="center" gap="2" justify="between" wrap>
                  <div>
                    <span className="cl-audit-log-panel__actor">{item.actor}</span>
                    <span className="cl-audit-log-panel__dot">•</span>
                    <span>{item.action}</span>
                  </div>
                  <Inline align="center" gap="2">
                    {item.latencyMs !== undefined && (
                      <span className="cl-audit-log-panel__latency">
                        {intl.formatMessage(messages.auditLogPanelLatency, {
                          latencyMs: item.latencyMs,
                        })}
                      </span>
                    )}
                    <ResponsiveTimestamp locale={intl.locale} timestamp={item.timestamp} />
                  </Inline>
                </Inline>
              </div>

              {item.diff && item.diff.length > 0 && (
                <div className="cl-audit-log-panel__diff">
                  {item.diff.map((row) => {
                    const label = auditFieldLabel(row.field, intl);
                    return (
                      <div key={row.field}>
                        <div className="cl-audit-log-panel__diff-prev">
                          - {label}: {row.previous}
                        </div>
                        <div className="cl-audit-log-panel__diff-curr">
                          + {label}: {row.current}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </Stack>
    </div>
  );
}
