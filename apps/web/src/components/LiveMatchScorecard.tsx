export interface LiveMatchGoalEvent {
  readonly minute: string | number;
  readonly player: string;
  readonly team: 'home' | 'away';
  readonly varConfirmed?: boolean;
}

export interface LiveMatchParticipant {
  readonly name: string;
  readonly score: number | string;
  readonly color?: string;
  readonly seed?: number | string;
}

export interface ComparatorTrace {
  readonly step: number;
  readonly text: string;
}

export interface LiveMatchScorecardProps {
  readonly location?: string;
  readonly operationsLabel?: string;
  readonly clock?: string;
  readonly homeTeam: LiveMatchParticipant;
  readonly awayTeam: LiveMatchParticipant;
  readonly events?: readonly LiveMatchGoalEvent[];
  readonly comparatorTrace?: ComparatorTrace;
  readonly className?: string;
}

export function LiveMatchScorecard({
  location = 'CANCHA 1',
  operationsLabel = 'OPERACIONES EN VIVO',
  clock = '78:48',
  homeTeam,
  awayTeam,
  events = [],
  comparatorTrace,
  className = '',
}: LiveMatchScorecardProps): React.JSX.Element {
  return (
    <article
      className={`cl-scorecard cl-chamfer ${className}`.trim()}
      style={{
        background: 'var(--cl-surface-panel)',
        border: '1px solid var(--cl-border-muted)',
        padding: 'var(--cl-space-4)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Tactical live status header */}
      <div
        className="cl-scorecard__header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--cl-border-muted)',
          paddingBottom: 'var(--cl-space-2)',
          marginBottom: 'var(--cl-space-4)',
          fontFamily: 'var(--cl-font-display)',
          fontSize: 'var(--cl-font-size-xs)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--cl-tracking-wider)',
          fontWeight: 'var(--cl-weight-bold)',
          flexWrap: 'wrap',
          gap: 'var(--cl-space-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
          <span style={{ color: 'var(--cl-state-live)', fontSize: '0.9em' }}>●</span>
          <span style={{ color: 'var(--cl-text-primary)' }}>{location}</span>
          <span style={{ color: 'var(--cl-text-muted)' }}>•</span>
          <span style={{ color: 'var(--cl-text-secondary)' }}>{operationsLabel}</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            fontFamily: 'var(--cl-font-mono)',
          }}
        >
          <span style={{ color: 'var(--cl-state-live)', fontSize: '0.9em' }}>●</span>
          <span style={{ color: 'var(--cl-state-live)', fontWeight: 'var(--cl-weight-bold)' }}>
            {clock}
          </span>
        </div>
      </div>

      {/* Teams and Central Monospace Score Box */}
      <div
        className="cl-scorecard__matchup"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 'var(--cl-space-4)',
          marginBottom: 'var(--cl-space-4)',
        }}
      >
        {/* Home Team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            justifyContent: 'flex-end',
            textAlign: 'right',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--cl-font-display)',
              fontSize: 'var(--cl-font-size-lg)',
              fontWeight: 'var(--cl-weight-bold)',
              textTransform: 'uppercase',
              color: 'var(--cl-text-primary)',
            }}
          >
            {homeTeam.name}
          </span>
          <span
            style={{
              color: homeTeam.color ?? 'var(--cl-color-cyan-400)',
              fontSize: 'var(--cl-font-size-sm)',
            }}
            aria-hidden="true"
          >
            ■
          </span>
        </div>

        {/* Central Monospace Score Box */}
        <div
          className="cl-scorecard__score-box"
          style={{
            background: 'var(--cl-surface-base)',
            border: '1px solid var(--cl-border-muted)',
            padding: 'var(--cl-space-2) var(--cl-space-4)',
            borderRadius: 'var(--cl-radius-sm)',
            fontFamily: 'var(--cl-font-mono)',
            fontSize: 'var(--cl-font-size-xl)',
            fontWeight: 'var(--cl-weight-bold)',
            color: 'var(--cl-text-primary)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 'var(--cl-tracking-wide)',
            textAlign: 'center',
            minWidth: '90px',
          }}
        >
          [ {homeTeam.score} : {awayTeam.score} ]
        </div>

        {/* Away Team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            justifyContent: 'flex-start',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              color: awayTeam.color ?? 'var(--cl-color-magenta-500)',
              fontSize: 'var(--cl-font-size-sm)',
            }}
            aria-hidden="true"
          >
            ■
          </span>
          <span
            style={{
              fontFamily: 'var(--cl-font-display)',
              fontSize: 'var(--cl-font-size-lg)',
              fontWeight: 'var(--cl-weight-bold)',
              textTransform: 'uppercase',
              color: 'var(--cl-text-primary)',
            }}
          >
            {awayTeam.name}
          </span>
        </div>
      </div>

      {/* Goal Events with VAR Status */}
      {events.length > 0 && (
        <div
          className="cl-scorecard__events"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--cl-space-2)',
            padding: 'var(--cl-space-2) 0',
            borderTop: '1px solid var(--cl-border-muted)',
            marginBottom: comparatorTrace ? 'var(--cl-space-3)' : 0,
          }}
        >
          {events.map((evt, idx) => (
            <div
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--cl-space-2)',
                background: 'var(--cl-surface-raised)',
                padding: 'var(--cl-space-1) var(--cl-space-2)',
                borderRadius: 'var(--cl-radius-sm)',
                fontSize: 'var(--cl-font-size-xs)',
                fontFamily: 'var(--cl-font-mono)',
              }}
            >
              <span style={{ color: 'var(--cl-state-live)', fontWeight: 'var(--cl-weight-bold)' }}>
                {evt.minute}&apos;
              </span>
              <span style={{ color: 'var(--cl-text-primary)' }}>{evt.player}</span>
              {evt.varConfirmed && (
                <span
                  style={{
                    background: 'var(--cl-surface-base)',
                    color: 'var(--cl-color-amber-400)',
                    border: '1px solid var(--cl-color-amber-400)',
                    padding: '0 4px',
                    borderRadius: '2px',
                    fontSize: '0.65rem',
                    fontWeight: 'var(--cl-weight-bold)',
                  }}
                >
                  VAR CONFIRMED
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Standings Comparator Trace Callout */}
      {comparatorTrace && (
        <div
          className="cl-scorecard__comparator-trace"
          style={{
            borderLeft: '3px solid var(--cl-state-live)',
            background: 'var(--cl-surface-raised)',
            padding: 'var(--cl-space-2) var(--cl-space-3)',
            marginTop: 'var(--cl-space-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--cl-space-2)',
            fontSize: 'var(--cl-font-size-xs)',
            fontFamily: 'var(--cl-font-mono)',
            color: 'var(--cl-text-secondary)',
          }}
        >
          <span style={{ color: 'var(--cl-state-live)', fontWeight: 'var(--cl-weight-bold)' }}>
            [Step {comparatorTrace.step}]
          </span>
          <span style={{ color: 'var(--cl-text-primary)' }}>{comparatorTrace.text}</span>
        </div>
      )}
    </article>
  );
}
