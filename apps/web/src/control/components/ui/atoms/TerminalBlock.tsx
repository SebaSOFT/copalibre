import { useState } from 'react';

export interface TerminalBlockProps {
  /** Optional window header title, e.g. "bash", "install.sh", or file name */
  readonly title?: string;
  /** CLI command to render with prompt `$ ` */
  readonly command?: string;
  /** Multi-line code, YAML or script snippet */
  readonly code?: string;
  /** Optional language indicator */
  readonly language?: 'bash' | 'yaml' | 'json';
  /** Optional additional CSS class */
  readonly className?: string;
  /** Accessible label for the copy action */
  readonly copyLabel?: string;
  /** Accessible label shown after copying */
  readonly copiedLabel?: string;
}

export function TerminalBlock({
  title = 'bash',
  command,
  code,
  language = 'bash',
  className = '',
  copyLabel = 'Copy command',
  copiedLabel = 'Copied!',
}: TerminalBlockProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const textToCopy = command ?? code ?? '';

  const handleCopy = async (): Promise<void> => {
    if (!textToCopy) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Clipboard write failed or unpermitted in test environment
    }
  };

  return (
    <div
      data-language={language}
      className={`cl-terminal-block cl-chamfer cl-chamfer--control ${className}`.trim()}
      style={{
        background: 'var(--cl-surface-base)',
        border: '1px solid var(--cl-border-muted)',
        fontFamily: 'var(--cl-font-mono)',
      }}
    >
      <div
        className="cl-terminal-block__header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--cl-space-2) var(--cl-space-3)',
          borderBottom: '1px solid var(--cl-border-muted)',
          background: 'var(--cl-surface-chrome)',
          gap: 'var(--cl-space-2)',
        }}
      >
        <div
          className="cl-terminal-block__dots"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          aria-hidden="true"
        >
          <span
            data-testid="dot-red"
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'var(--cl-state-destructive)',
              display: 'inline-block',
            }}
          />
          <span
            data-testid="dot-yellow"
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'var(--cl-state-upcoming)',
              display: 'inline-block',
            }}
          />
          <span
            data-testid="dot-green"
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'var(--cl-state-positive)',
              display: 'inline-block',
            }}
          />
        </div>

        <span
          className="cl-terminal-block__title"
          style={{
            fontSize: 'var(--cl-font-size-xs)',
            color: 'var(--cl-text-secondary)',
            letterSpacing: 'var(--cl-tracking-wide)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>

        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copyLabel}
          className="cl-terminal-block__copy cl-focusable"
          style={{
            background: 'transparent',
            border: '1px solid var(--cl-border-muted)',
            borderRadius: 'var(--cl-radius-sm)',
            color: copied ? 'var(--cl-state-live)' : 'var(--cl-text-secondary)',
            fontSize: 'var(--cl-font-size-xs)',
            padding: '2px 8px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {copied ? (
            <span>{copiedLabel}</span>
          ) : (
            <>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>copy</span>
            </>
          )}
        </button>
      </div>

      <div
        className="cl-terminal-block__body"
        style={{
          padding: 'var(--cl-space-3) var(--cl-space-4)',
          overflowX: 'auto',
          fontSize: 'var(--cl-font-size-sm)',
          lineHeight: '1.6',
        }}
      >
        {command && (
          <div style={{ display: 'flex', gap: 'var(--cl-space-2)', alignItems: 'baseline' }}>
            <span
              style={{
                color: 'var(--cl-state-live)',
                userSelect: 'none',
                fontWeight: 'var(--cl-weight-bold)',
              }}
              aria-hidden="true"
            >
              $
            </span>
            <code style={{ color: 'var(--cl-text-primary)' }}>{command}</code>
          </div>
        )}
        {code && (
          <pre
            style={{
              fontFamily: 'inherit',
              color: 'var(--cl-text-primary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
