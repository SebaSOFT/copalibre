import { useIntl } from 'react-intl';
import { messages } from '../../../i18n/messages.en.js';

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
    <div
      className={`cl-audit-log-panel cl-chamfer cl-chamfer--control ${className}`.trim()}
      style={{
        background: 'var(--cl-surface-panel)',
        border: '1px solid var(--cl-border-muted)',
        padding: 'var(--cl-space-4)',
      }}
    >
      <div
        className="cl-audit-log-panel__header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--cl-space-2)',
          marginBottom: 'var(--cl-space-3)',
          borderBottom: '1px solid var(--cl-border-muted)',
          paddingBottom: 'var(--cl-space-2)',
        }}
      >
        <h3
          style={{
            margin: 0,
            minWidth: 0,
            fontFamily: 'var(--cl-font-display)',
            fontSize: 'var(--cl-font-size-md)',
            fontWeight: 'var(--cl-weight-bold)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--cl-tracking-wide)',
            color: 'var(--cl-text-primary)',
          }}
        >
          {title}
        </h3>
        <span
          style={{
            fontFamily: 'var(--cl-font-mono)',
            fontSize: 'var(--cl-font-size-xs)',
            color: 'var(--cl-text-muted)',
          }}
        >
          {intl.formatMessage(messages.auditLogPanelEventCount, { count: items.length })}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cl-space-3)' }}>
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
              style={{
                padding: 'var(--cl-space-2) var(--cl-space-3)',
                background: 'var(--cl-surface-chrome)',
                borderRadius: '0 var(--cl-radius-sm) var(--cl-radius-sm) 0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--cl-space-2)',
                  fontSize: 'var(--cl-font-size-xs)',
                  fontFamily: 'var(--cl-font-mono)',
                  color: 'var(--cl-text-secondary)',
                  marginBottom: 'var(--cl-space-1)',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <span
                    style={{ fontWeight: 'var(--cl-weight-bold)', color: 'var(--cl-text-primary)' }}
                  >
                    {item.actor}
                  </span>
                  <span style={{ margin: '0 6px', color: 'var(--cl-text-muted)' }}>•</span>
                  <span>{item.action}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
                  {item.latencyMs !== undefined && (
                    <span
                      style={{
                        color: 'var(--cl-state-live)',
                        background: 'var(--cl-surface-base)',
                        padding: '1px 6px',
                        borderRadius: 'var(--cl-radius-sm)',
                        fontSize: 'var(--cl-font-size-xs)',
                      }}
                    >
                      {intl.formatMessage(messages.auditLogPanelLatency, {
                        latencyMs: item.latencyMs,
                      })}
                    </span>
                  )}
                  <span>{item.timestamp}</span>
                </div>
              </div>

              {item.diff && item.diff.length > 0 && (
                <div
                  className="cl-audit-log-panel__diff"
                  style={{
                    fontFamily: 'var(--cl-font-mono)',
                    fontSize: 'var(--cl-font-size-xs)',
                    marginTop: 'var(--cl-space-2)',
                    padding: 'var(--cl-space-2)',
                    background: 'var(--cl-surface-base)',
                    borderRadius: 'var(--cl-radius-sm)',
                    border: '1px solid var(--cl-border-muted)',
                  }}
                >
                  {item.diff.map((row) => (
                    <div key={row.field}>
                      <div style={{ color: 'var(--cl-state-destructive)' }}>
                        - {row.field}: {row.previous}
                      </div>
                      <div style={{ color: 'var(--cl-state-positive)' }}>
                        + {row.field}: {row.current}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
