import { TerminalBlock } from '../../../control/components/ui/atoms/TerminalBlock.js';

export interface DisciplineCardProps {
  /** The full display name of the sport or discipline, e.g. "Fútbol 11v11" */
  readonly title: string;
  /** The descriptor module code, e.g. "football-11v11" */
  readonly code: string;
  /** Optional hero image URL */
  readonly imageSrc?: string;
  /** Optional image alt text */
  readonly imageAlt?: string;
  /** Label for available funds badge (default: "FONDO DISPONIBLE") */
  readonly availableFundLabel?: string;
  /** Category / discipline label (default: "DISCIPLINE") */
  readonly categoryLabel?: string;
  /** Characteristic attribute pills (e.g. ['single-elimination', 'quarter', '11v11']) */
  readonly formatPills?: readonly string[];
  /** CLI install command */
  readonly installCommand?: string;
  /** Additional CSS class */
  readonly className?: string;
}

export function DisciplineCard({
  title,
  code,
  imageSrc,
  imageAlt,
  availableFundLabel = 'FONDO DISPONIBLE',
  categoryLabel = 'DISCIPLINE',
  formatPills = [],
  installCommand,
  className = '',
}: DisciplineCardProps): React.JSX.Element {
  const defaultCommand = installCommand ?? `copalibre module install ${code}`;

  return (
    <div
      className={`cl-discipline-card cl-chamfer ${className}`.trim()}
      style={{
        background: 'var(--cl-surface-panel)',
        border: '1px solid var(--cl-border-muted)',
        padding: 'var(--cl-space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--cl-space-3)',
      }}
    >
      {/* 4:5 Chamfered Image Frame Header */}
      <div className="cl-image-frame" style={{ width: '100%', maxHeight: '240px' }}>
        {imageSrc ? (
          <img src={imageSrc} alt={imageAlt ?? title} />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ color: 'var(--cl-text-muted)' }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m4.93 4.93 4.24 4.24" />
            <path d="m14.83 9.17 4.24-4.24" />
            <path d="m14.83 14.83 4.24 4.24" />
            <path d="m9.17 14.83-4.24 4.24" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        )}
      </div>

      {/* Badges and Title */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            flexWrap: 'wrap',
            marginBottom: 'var(--cl-space-2)',
          }}
        >
          <span
            style={{
              background: 'var(--cl-surface-base)',
              border: '1px solid var(--cl-color-amber-400)',
              color: 'var(--cl-color-amber-400)',
              fontSize: '0.65rem',
              fontWeight: 'var(--cl-weight-bold)',
              padding: '1px 6px',
              borderRadius: 'var(--cl-radius-sm)',
              letterSpacing: 'var(--cl-tracking-wide)',
            }}
          >
            [{availableFundLabel}]
          </span>

          <span
            style={{
              background: 'var(--cl-surface-raised)',
              border: '1px solid var(--cl-border-muted)',
              color: 'var(--cl-text-secondary)',
              fontSize: '0.65rem',
              fontWeight: 'var(--cl-weight-bold)',
              padding: '1px 6px',
              borderRadius: 'var(--cl-radius-sm)',
              letterSpacing: 'var(--cl-tracking-wide)',
            }}
          >
            [{categoryLabel}]
          </span>
        </div>

        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--cl-font-display)',
            fontSize: 'var(--cl-font-size-xl)',
            fontWeight: 'var(--cl-weight-bold)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--cl-tracking-wide)',
            color: 'var(--cl-text-primary)',
          }}
        >
          {title}
        </h3>
      </div>

      {/* Attribute Pill Cluster */}
      {formatPills.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--cl-space-2)',
          }}
        >
          {formatPills.map((pill, idx) => (
            <span
              key={idx}
              style={{
                background: 'var(--cl-surface-base)',
                border: '1px solid var(--cl-border-muted)',
                color: 'var(--cl-text-secondary)',
                fontSize: 'var(--cl-font-size-xs)',
                fontFamily: 'var(--cl-font-mono)',
                padding: '2px 8px',
                borderRadius: 'var(--cl-radius-sm)',
              }}
            >
              [{pill}]
            </span>
          ))}
        </div>
      )}

      {/* Embedded Terminal Command */}
      <div style={{ marginTop: 'auto' }}>
        <TerminalBlock
          title="install-module"
          command={defaultCommand}
          copyLabel={`Copy install command for ${title}`}
        />
      </div>
    </div>
  );
}
