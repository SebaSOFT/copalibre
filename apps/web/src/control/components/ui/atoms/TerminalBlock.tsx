import { useState } from 'react';

/**
 * `terminal` is the window: three dots, a `$` prompt, a command.
 * `file` is a listing: a filename header, a copy action, an inset body, and
 * neither of the terminal's ornaments — because a YAML file shown behind window
 * dots and a shell prompt reads as something to be run rather than something to
 * be saved.
 */
export type TerminalBlockVariant = 'terminal' | 'file';

export interface TerminalBlockProps {
  /** Optional window header title, e.g. "bash", "install.sh", or file name */
  readonly title?: string;
  /** CLI command to render with prompt `$ ` */
  readonly command?: string;
  /** Multi-line code, YAML or script snippet */
  readonly code?: string;
  /** Optional language indicator */
  readonly language?: 'bash' | 'yaml' | 'json';
  readonly variant?: TerminalBlockVariant;
  /** Optional additional CSS class */
  readonly className?: string;
  /** Accessible label for the copy action */
  readonly copyLabel?: string;
  /** Accessible label shown after copying */
  readonly copiedLabel?: string;
  /**
   * Shown when the clipboard is denied or absent.
   *
   * A copy that silently does nothing is worse than one that fails: the reader
   * walks away believing they have the text. So the failure is reported, and
   * the code stays selectable by hand either way — it is real text in a `pre`,
   * not a canvas, so a page with no JavaScript at all can still be copied from.
   */
  readonly copyFailedLabel?: string;
  /** Names the code region for a reader arriving at it by keyboard. */
  readonly codeRegionLabel?: string;
}

export function TerminalBlock({
  title = 'bash',
  command,
  code,
  language = 'bash',
  variant = 'terminal',
  className = '',
  copyLabel = 'Copy command',
  copiedLabel = 'Copied!',
  copyFailedLabel = 'Copy failed — select the text to copy it',
  codeRegionLabel,
}: TerminalBlockProps): React.JSX.Element {
  const [outcome, setOutcome] = useState<'idle' | 'copied' | 'failed'>('idle');
  const isFile = variant === 'file';
  // Exactly what is on screen, byte for byte. A copy that trimmed or re-joined
  // its source would hand over something that is not what was reviewed.
  const textToCopy = command ?? code ?? '';

  const handleCopy = async (): Promise<void> => {
    if (!textToCopy) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        setOutcome('failed');
        return;
      }
      await navigator.clipboard.writeText(textToCopy);
      setOutcome('copied');
      setTimeout(() => setOutcome('idle'), 2000);
    } catch {
      // Denied by permission policy, or unavailable outside a secure context.
      setOutcome('failed');
    }
  };

  return (
    <div
      data-language={language}
      data-variant={variant}
      className={`cl-terminal-block${isFile ? ' cl-terminal-block--file' : ''} cl-chamfer cl-chamfer--control ${className}`.trim()}
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
        {!isFile && (
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
        )}

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
            color:
              outcome === 'copied'
                ? 'var(--cl-state-live)'
                : outcome === 'failed'
                  ? 'var(--cl-state-destructive)'
                  : 'var(--cl-text-secondary)',
            fontSize: 'var(--cl-font-size-xs)',
            padding: '2px 8px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {outcome === 'idle' ? (
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
          ) : (
            <span>{outcome === 'copied' ? copiedLabel : copyFailedLabel}</span>
          )}
        </button>
      </div>

      {/* Announced, not just coloured: the outcome of an action nobody can see. */}
      <span className="cl-visually-hidden" role="status">
        {outcome === 'copied' ? copiedLabel : outcome === 'failed' ? copyFailedLabel : ''}
      </span>

      <div
        aria-label={codeRegionLabel}
        className="cl-terminal-block__body"
        role={codeRegionLabel === undefined ? undefined : 'region'}
        style={{
          padding: 'var(--cl-space-3) var(--cl-space-4)',
          overflowX: 'auto',
          fontSize: 'var(--cl-font-size-sm)',
          lineHeight: '1.6',
        }}
        tabIndex={codeRegionLabel === undefined ? undefined : 0}
      >
        {command && (
          <div style={{ display: 'flex', gap: 'var(--cl-space-2)', alignItems: 'baseline' }}>
            {!isFile && (
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
            )}
            <code style={{ color: 'var(--cl-text-primary)' }}>{command}</code>
          </div>
        )}
        {code && (
          <pre
            style={{
              fontFamily: 'inherit',
              color: 'var(--cl-text-primary)',
              // A file listing keeps its columns: which column a YAML key sits
              // in is the one thing wrapping destroys, so long lines scroll
              // inside this region instead of re-flowing.
              whiteSpace: isFile ? 'pre' : 'pre-wrap',
              margin: 0,
            }}
          >
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
