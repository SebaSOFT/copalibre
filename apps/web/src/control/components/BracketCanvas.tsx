import {
  DEFAULT_GEOMETRY,
  layoutBracket,
  zoomIn,
  zoomOut,
  type CanvasMatch,
} from '../lib/bracket-canvas.js';
import { Button } from './ui/button.js';

/**
 * A6 — the bracket canvas (0024).
 *
 * Draws the engine's structure and nothing else. Connectors come from the slot
 * sources the engine declared, so a losers' bracket that takes an entrant from
 * two places draws two lines because the engine said so, not because this file
 * knows what a losers' bracket is.
 */
export function BracketCanvas({
  matches,
  zoom,
  onZoomChange,
  emptyMessage = 'Todavía no hay estructura generada para esta fase.',
}: {
  readonly matches: readonly CanvasMatch[];
  readonly zoom: number;
  readonly onZoomChange?: (zoom: number) => void;
  readonly emptyMessage?: string;
}): React.JSX.Element {
  const layout = layoutBracket(matches);
  const padding = DEFAULT_GEOMETRY.grid * 2;

  return (
    <div style={wrapperStyle}>
      <div style={toolbarStyle}>
        <Button
          aria-label="Alejar"
          onClick={() => onZoomChange?.(zoomOut(zoom))}
          type="button"
          variant="secondary"
        >
          −
        </Button>
        <span style={zoomLabelStyle}>{Math.round(zoom * 100)}%</span>
        <Button
          aria-label="Acercar"
          onClick={() => onZoomChange?.(zoomIn(zoom))}
          type="button"
          variant="secondary"
        >
          +
        </Button>
      </div>

      {layout.matches.length === 0 ? (
        <p style={mutedStyle}>{emptyMessage}</p>
      ) : (
        <div style={scrollStyle}>
          <div
            aria-label="Llave"
            role="group"
            style={{
              position: 'relative',
              width: layout.width + padding,
              height: layout.height + padding,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          >
            <svg
              aria-hidden="true"
              height={layout.height + padding}
              style={svgStyle}
              width={layout.width + padding}
            >
              {layout.connectors.map((connector) => (
                <polyline
                  fill="none"
                  key={`${connector.fromMatchId}->${connector.toMatchId}-${connector.kind}`}
                  points={connector.points.map((point) => `${point.x},${point.y}`).join(' ')}
                  stroke={
                    connector.kind === 'loser-of'
                      ? 'var(--cl-border-muted)'
                      : 'var(--cl-border-strong)'
                  }
                  strokeDasharray={connector.kind === 'loser-of' ? '4 4' : undefined}
                  strokeWidth={2}
                />
              ))}
            </svg>

            {layout.matches.map((node) => (
              <article
                className="cl-card cl-chamfer"
                data-bracket={node.bracket}
                data-match={node.matchId}
                key={node.matchId}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  minHeight: node.height,
                  padding: 'var(--cl-space-2)',
                  display: 'grid',
                  gap: 2,
                }}
              >
                <header style={nodeHeaderStyle}>
                  <span>{node.matchId}</span>
                  {node.format === undefined ? null : (
                    <span className="cl-badge">{node.format}</span>
                  )}
                </header>
                {node.slots.map((slot, index) => (
                  <div
                    key={`${node.matchId}-${index}`}
                    style={slot.pending ? pendingSlotStyle : slotStyle}
                  >
                    {/* Named, never blank: "Ganador del WB-R1-M2" tells an
                        operator what has to happen; an empty box reads as a bug. */}
                    <span>{slot.pending ? `TBD · ${slot.label}` : slot.label}</span>
                    <span style={scoreStyle}>{slot.score ?? '—'}</span>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const wrapperStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-3)' };
const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  alignItems: 'center',
};
const zoomLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--cl-font-mono)',
  minWidth: '4rem',
  textAlign: 'center',
};
const scrollStyle: React.CSSProperties = { overflow: 'auto', maxHeight: '70vh' };
const svgStyle: React.CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };
const nodeHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.6875rem',
  color: 'var(--cl-text-muted)',
};
const slotStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--cl-space-2)',
  fontSize: '0.8125rem',
};
const pendingSlotStyle: React.CSSProperties = {
  ...slotStyle,
  color: 'var(--cl-text-muted)',
  borderLeft: '2px dashed var(--cl-border-muted)',
  paddingLeft: 'var(--cl-space-2)',
};
const scoreStyle: React.CSSProperties = { fontFamily: 'var(--cl-font-mono)' };
const mutedStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
};
