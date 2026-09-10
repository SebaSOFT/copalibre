export interface ChampionshipParticipant {
  readonly name: string;
  readonly seed?: number | string;
  readonly score?: number | string;
  readonly winner?: boolean;
}

export interface ChampionshipMatchCardProps {
  /** Card header title, e.g. "GRAND FINAL", "GRAN FINAL", "CHAMPIONSHIP" */
  readonly title?: string;
  /** Home finalist */
  readonly homeParticipant: ChampionshipParticipant;
  /** Away finalist */
  readonly awayParticipant: ChampionshipParticipant;
  /** Match status (e.g. "FINAL", "LIVE", "SCHEDULED") */
  readonly status?: string;
  /** Scheduled time or date */
  readonly scheduledTime?: string;
  /** Additional CSS class */
  readonly className?: string;
}

export function ChampionshipMatchCard({
  title = 'GRAND FINAL',
  homeParticipant,
  awayParticipant,
  status = 'FINAL',
  scheduledTime,
  className = '',
}: ChampionshipMatchCardProps): React.JSX.Element {
  const isLive = status.toUpperCase() === 'LIVE';

  return (
    <div
      className={`cl-championship-card cl-chamfer ${className}`.trim()}
      style={{
        background: 'var(--cl-surface-panel)',
        border: '2px solid var(--cl-state-live)',
        boxShadow: isLive ? 'var(--cl-glow-cyan)' : 'none',
        padding: 'var(--cl-space-4)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header with Trophy Icon and Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--cl-border-muted)',
          paddingBottom: 'var(--cl-space-2)',
          marginBottom: 'var(--cl-space-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
          {/* Trophy Icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--cl-state-live)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>

          <span
            style={{
              fontFamily: 'var(--cl-font-display)',
              fontSize: 'var(--cl-font-size-sm)',
              fontWeight: 'var(--cl-weight-bold)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--cl-tracking-wider)',
              color: 'var(--cl-state-live)',
            }}
          >
            {title}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            fontFamily: 'var(--cl-font-mono)',
            fontSize: 'var(--cl-font-size-xs)',
          }}
        >
          {scheduledTime && <span style={{ color: 'var(--cl-text-muted)' }}>{scheduledTime}</span>}
          <span
            style={{
              background: isLive ? 'var(--cl-state-live)' : 'var(--cl-surface-base)',
              color: isLive ? 'var(--cl-surface-base)' : 'var(--cl-text-primary)',
              padding: '1px 6px',
              borderRadius: 'var(--cl-radius-sm)',
              fontWeight: 'var(--cl-weight-bold)',
              border: isLive ? 'none' : '1px solid var(--cl-border-muted)',
            }}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Participants Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cl-space-2)' }}>
        {/* Home Participant */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--cl-space-2) var(--cl-space-3)',
            background: homeParticipant.winner
              ? 'var(--cl-surface-chrome)'
              : 'var(--cl-surface-base)',
            borderLeft: homeParticipant.winner
              ? '3px solid var(--cl-state-live)'
              : '3px solid transparent',
            borderRadius: '0 var(--cl-radius-sm) var(--cl-radius-sm) 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
            {homeParticipant.seed !== undefined && (
              <span
                style={{
                  fontFamily: 'var(--cl-font-mono)',
                  fontSize: 'var(--cl-font-size-xs)',
                  color: 'var(--cl-text-muted)',
                }}
              >
                [{homeParticipant.seed}]
              </span>
            )}
            <span
              style={{
                fontFamily: 'var(--cl-font-display)',
                fontWeight: homeParticipant.winner
                  ? 'var(--cl-weight-bold)'
                  : 'var(--cl-weight-semibold)',
                fontSize: 'var(--cl-font-size-base)',
                textTransform: 'uppercase',
                color: homeParticipant.winner
                  ? 'var(--cl-text-primary)'
                  : 'var(--cl-text-secondary)',
              }}
            >
              {homeParticipant.name}
            </span>
          </div>

          {homeParticipant.score !== undefined && (
            <span
              style={{
                fontFamily: 'var(--cl-font-mono)',
                fontSize: 'var(--cl-font-size-lg)',
                fontWeight: 'var(--cl-weight-bold)',
                fontVariantNumeric: 'tabular-nums',
                color: homeParticipant.winner ? 'var(--cl-state-live)' : 'var(--cl-text-primary)',
              }}
            >
              {homeParticipant.score}
            </span>
          )}
        </div>

        {/* Away Participant */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--cl-space-2) var(--cl-space-3)',
            background: awayParticipant.winner
              ? 'var(--cl-surface-chrome)'
              : 'var(--cl-surface-base)',
            borderLeft: awayParticipant.winner
              ? '3px solid var(--cl-state-live)'
              : '3px solid transparent',
            borderRadius: '0 var(--cl-radius-sm) var(--cl-radius-sm) 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
            {awayParticipant.seed !== undefined && (
              <span
                style={{
                  fontFamily: 'var(--cl-font-mono)',
                  fontSize: 'var(--cl-font-size-xs)',
                  color: 'var(--cl-text-muted)',
                }}
              >
                [{awayParticipant.seed}]
              </span>
            )}
            <span
              style={{
                fontFamily: 'var(--cl-font-display)',
                fontWeight: awayParticipant.winner
                  ? 'var(--cl-weight-bold)'
                  : 'var(--cl-weight-semibold)',
                fontSize: 'var(--cl-font-size-base)',
                textTransform: 'uppercase',
                color: awayParticipant.winner
                  ? 'var(--cl-text-primary)'
                  : 'var(--cl-text-secondary)',
              }}
            >
              {awayParticipant.name}
            </span>
          </div>

          {awayParticipant.score !== undefined && (
            <span
              style={{
                fontFamily: 'var(--cl-font-mono)',
                fontSize: 'var(--cl-font-size-lg)',
                fontWeight: 'var(--cl-weight-bold)',
                fontVariantNumeric: 'tabular-nums',
                color: awayParticipant.winner ? 'var(--cl-state-live)' : 'var(--cl-text-primary)',
              }}
            >
              {awayParticipant.score}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
