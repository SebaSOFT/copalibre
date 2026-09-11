import type { ReactNode } from 'react';
import { Button } from '../atoms/button.js';

export interface CalloutBannerProps {
  /** Section or announcement title */
  readonly title: string;
  /** Explanatory description */
  readonly description: ReactNode;
  /** Label for the call to action button */
  readonly actionLabel?: string;
  /** Action click handler */
  readonly onAction?: () => void;
  /** Optional link href if action navigates */
  readonly actionHref?: string;
  /** Additional CSS classes */
  readonly className?: string;
}

export function CalloutBanner({
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className = '',
}: CalloutBannerProps): React.JSX.Element {
  return (
    <div
      className={`cl-callout-banner cl-chamfer cl-chamfer--control cl-accent-rail ${className}`.trim()}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--cl-space-4)',
        padding: 'var(--cl-space-4) var(--cl-space-5)',
        background: 'var(--cl-surface-panel)',
        // Discrete sides, not the `border` shorthand: an inline declaration
        // always wins specificity over a class, and the shorthand sets every
        // side including left, which would silently override the accent
        // rail's own `border-left` — the class the `cl-accent-rail` name
        // provides below, not this inline object.
        borderTop: '1px solid var(--cl-border-muted)',
        borderRight: '1px solid var(--cl-border-muted)',
        borderBottom: '1px solid var(--cl-border-muted)',
      }}
    >
      <div
        style={{
          flex: '1 1 240px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--cl-space-1)',
        }}
      >
        <h3
          className="cl-callout-banner__title"
          style={{
            fontFamily: 'var(--cl-font-display)',
            fontSize: 'var(--cl-font-size-lg)',
            fontWeight: 'var(--cl-weight-bold)',
            color: 'var(--cl-text-primary)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--cl-tracking-wide)',
          }}
        >
          {title}
        </h3>
        <div
          className="cl-callout-banner__description"
          style={{
            color: 'var(--cl-text-secondary)',
            fontSize: 'var(--cl-font-size-sm)',
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      </div>

      {actionLabel && (
        <div style={{ flexShrink: 0 }}>
          {actionHref ? (
            <a
              href={actionHref}
              className="cl-btn cl-btn--primary cl-chamfer cl-chamfer--control cl-focusable"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--cl-space-2)',
                textDecoration: 'none',
              }}
            >
              <span>{actionLabel}</span>
              <span aria-hidden="true">→</span>
            </a>
          ) : (
            <Button
              variant="primary"
              onClick={onAction}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--cl-space-2)',
              }}
            >
              <span>{actionLabel}</span>
              <span aria-hidden="true">→</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
