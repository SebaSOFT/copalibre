export interface TiebreakerRuleItem {
  /** The 1-based order in the tiebreaker chain */
  readonly step: number;
  /** Human-readable criteria label, e.g. "Total Points", "Head-to-Head Goal Diff" */
  readonly label: string;
  /** Whether this rule was triggered/decisive in resolving the tie */
  readonly triggered?: boolean;
  /** Optional secondary detail or values evaluated */
  readonly detail?: string;
}

export interface TiebreakerSequenceProps {
  /** Ordered array of tiebreaker criteria */
  readonly rules: readonly TiebreakerRuleItem[];
  /** Optional title or section heading */
  readonly title?: string;
  /** Additional CSS classes */
  readonly className?: string;
}

export function TiebreakerSequence({
  rules,
  title,
  className = '',
}: TiebreakerSequenceProps): React.JSX.Element {
  return (
    <div
      className={`cl-tiebreaker-sequence ${className}`.trim()}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cl-space-2)' }}
    >
      {title && (
        <div
          style={{
            fontFamily: 'var(--cl-font-display)',
            fontWeight: 'var(--cl-weight-bold)',
            fontSize: 'var(--cl-font-size-xs)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--cl-tracking-wider)',
            color: 'var(--cl-text-secondary)',
          }}
        >
          {title}
        </div>
      )}

      <ol
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--cl-space-2)',
          listStyle: 'none',
          padding: 0,
        }}
      >
        {rules.map((rule, index) => {
          const isTriggered = Boolean(rule.triggered);
          const isLast = index === rules.length - 1;

          return (
            <li
              key={rule.step}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--cl-space-2)',
              }}
            >
              <div
                className={`cl-tiebreaker-sequence__rule ${
                  isTriggered ? 'cl-tiebreaker-sequence__rule--triggered' : ''
                }`.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--cl-space-2)',
                  padding: 'var(--cl-space-1) var(--cl-space-3)',
                  background: isTriggered ? 'var(--cl-surface-base)' : 'var(--cl-surface-panel)',
                  // A resting glow (`--cl-glow-cyan`) used to mark this state — an
                  // ornament DESIGN.md's anti-glow rule forbids for a state that
                  // never goes away on its own. A rule that triggered already reads
                  // as such from its background, its text colour and its "Triggered"
                  // badge below; the border doubling in width on top of those is the
                  // fourth cue, carrying the same emphasis without the glow.
                  border: isTriggered
                    ? '2px solid var(--cl-state-live)'
                    : '1px solid var(--cl-border-muted)',
                  borderRadius: 'var(--cl-radius-sm)',
                  color: isTriggered ? 'var(--cl-state-live)' : 'var(--cl-text-secondary)',
                  fontFamily: 'var(--cl-font-mono)',
                  fontSize: 'var(--cl-font-size-xs)',
                }}
              >
                <span style={{ fontWeight: 'var(--cl-weight-bold)' }}>{rule.step}.</span>
                <span>{rule.label}</span>
                {isTriggered && (
                  <span
                    style={{
                      background: 'var(--cl-state-live)',
                      color: 'var(--cl-surface-base)',
                      fontSize: 'var(--cl-font-size-xs)',
                      fontWeight: 'var(--cl-weight-bold)',
                      padding: '1px 4px',
                      borderRadius: 'var(--cl-radius-sm)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--cl-tracking-wide)',
                    }}
                  >
                    Triggered
                  </span>
                )}
              </div>

              {!isLast && (
                <span
                  style={{
                    color: 'var(--cl-text-muted)',
                    fontSize: 'var(--cl-font-size-sm)',
                    userSelect: 'none',
                  }}
                  aria-hidden="true"
                >
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
