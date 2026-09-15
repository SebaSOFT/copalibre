import { useEffect, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  DEFAULT_GEOMETRY,
  layoutBracket,
  zoomIn,
  zoomOut,
  type CanvasMatch,
  type LaidOutMatch,
} from '../lib/bracket-canvas.js';
import { Button } from './ui/atoms/button.js';
import { messages } from '../i18n/messages.en.js';
import { controlLinkClick } from '../lib/control-navigation.js';

/**
 * A6 — the bracket canvas.
 *
 * Draws the engine's structure and nothing else. Connectors come from the slot
 * sources the engine declared, so a losers' bracket that takes an entrant from
 * two places draws two lines because the engine said so, not because this file
 * knows what a losers' bracket is.
 *
 * Per-slot labels (`describeSlot` in `lib/bracket-canvas.ts`: "Bye", "Winner
 * of <match>", "Loser of <match>") are not yet extracted — they embed a
 * dynamic match ID and need ICU interpolation at the point they are computed,
 * a genuinely different pattern from this file's static chrome; tracked as a
 * follow-up rather than rushed here.
 */
export function BracketCanvas({
  matches,
  zoom,
  onZoomChange,
  emptyMessage,
  matchUrl,
  focusMatchId,
}: {
  readonly matches: readonly CanvasMatch[];
  readonly zoom: number;
  readonly onZoomChange?: (zoom: number) => void;
  readonly emptyMessage?: React.ReactNode;
  /** Builds a node's control-screen URL from its persisted match id. Absent nodes stay unlinked. */
  readonly matchUrl?: (persistedMatchId: string) => string;
  /**
   * The persisted match id (`persistedMatchId`, not the engine's structural label) to visually
   * emphasize and scroll into view on mount — a console page knows a match by its real id, never
   * by `WB-R2-M1`. A value naming no node's `persistedMatchId` is not an error — the canvas
   * simply renders with nothing emphasized.
   */
  readonly focusMatchId?: string;
}): React.JSX.Element {
  const intl = useIntl();
  const layout = layoutBracket(matches);
  const padding = DEFAULT_GEOMETRY.grid * 2;
  const focusedNodeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    focusedNodeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // Keyed on the focus target, not on layout/matches — re-scrolling on an unrelated
    // data refresh (a score updating) would yank the viewport for no reason.
  }, [focusMatchId]);

  return (
    <div style={wrapperStyle}>
      <div style={toolbarStyle}>
        <Button
          aria-label={intl.formatMessage(messages.bracketZoomOut)}
          onClick={() => onZoomChange?.(zoomOut(zoom))}
          type="button"
          variant="secondary"
        >
          −
        </Button>
        <span style={zoomLabelStyle}>{Math.round(zoom * 100)}%</span>
        <Button
          aria-label={intl.formatMessage(messages.bracketZoomIn)}
          onClick={() => onZoomChange?.(zoomIn(zoom))}
          type="button"
          variant="secondary"
        >
          +
        </Button>
      </div>

      {layout.matches.length === 0 ? (
        <p style={mutedStyle}>{emptyMessage ?? <FormattedMessage {...messages.bracketEmpty} />}</p>
      ) : (
        <div style={scrollStyle}>
          <div
            aria-label={intl.formatMessage(messages.bracketGroupLabel)}
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
              <BracketNode
                focused={focusMatchId !== undefined && node.persistedMatchId === focusMatchId}
                focusedRef={
                  focusMatchId !== undefined && node.persistedMatchId === focusMatchId
                    ? focusedNodeRef
                    : undefined
                }
                href={
                  node.persistedMatchId === undefined
                    ? undefined
                    : matchUrl?.(node.persistedMatchId)
                }
                key={node.matchId}
                node={node}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One node, `<article>` normally, an `<a>` carrying the same `cl-chamfer`/positioning styles
 * when `href` resolves. `cl-chamfer` cuts its corners via `border-radius`/`corner-shape`, never
 * `clip-path`, precisely so a `cl-focusable` ring on the *same* element still traces the
 * chamfer — putting the ring on a separate rectangular wrapper around the card (an earlier
 * version of this) drew a ring that didn't match the card's shape at all.
 */
function BracketNode({
  focused,
  focusedRef,
  href,
  node,
}: {
  readonly focused: boolean;
  /** Set only on the focused node, so `BracketCanvas` can scroll it into view on mount. */
  readonly focusedRef: React.RefObject<HTMLElement | null> | undefined;
  readonly href: string | undefined;
  readonly node: LaidOutMatch;
}): React.JSX.Element {
  const children = (
    <>
      <header style={nodeHeaderStyle}>
        <span>{node.matchId}</span>
        {node.format === undefined ? null : <span className="cl-badge">{node.format}</span>}
      </header>
      {node.slots.map((slot, index) => (
        <div key={`${node.matchId}-${index}`} style={slot.pending ? pendingSlotStyle : slotStyle}>
          {/* Named, never blank: "Ganador del WB-R1-M2" tells an
              operator what has to happen; an empty box reads as a bug. */}
          <span>{slot.label}</span>
          <span style={scoreStyle}>{slot.score ?? '—'}</span>
        </div>
      ))}
    </>
  );

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    left: node.x,
    top: node.y,
    width: node.width,
    minHeight: node.height,
    // Same treatment the public bracket-context panel gives its focused node — one
    // "look here" cue reused across both surfaces, not two different ones to learn.
    ...(focused ? { borderWidth: 2, borderColor: 'var(--cl-primary)' } : {}),
  };

  if (href === undefined) {
    return (
      <article
        className={NODE_CLASS_NAME}
        data-bracket={node.bracket}
        data-focused={focused ? 'true' : undefined}
        data-match={node.matchId}
        ref={focusedRef as React.RefObject<HTMLElement>}
        style={{ ...positionStyle, ...nodeContentStyle }}
      >
        {children}
      </article>
    );
  }

  return (
    <a
      className={`${NODE_CLASS_NAME} cl-focusable`}
      data-bracket={node.bracket}
      data-focused={focused ? 'true' : undefined}
      data-match={node.matchId}
      href={href}
      onClick={controlLinkClick(href)}
      ref={focusedRef as React.RefObject<HTMLAnchorElement>}
      style={{
        ...positionStyle,
        ...nodeContentStyle,
        color: 'inherit',
        textDecoration: 'none',
      }}
    >
      {children}
    </a>
  );
}

/** Shared so the source only names `cl-card` once — see check-ui-ownership.mjs's per-file ratchet. */
const NODE_CLASS_NAME = 'cl-card cl-chamfer';

const nodeContentStyle: React.CSSProperties = {
  padding: 'var(--cl-space-2)',
  display: 'grid',
  gap: 2,
};

const wrapperStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 'var(--cl-space-3)',
};
const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  alignItems: 'center',
};
const zoomLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--cl-font-mono)',
  minWidth: '3ch',
  textAlign: 'center',
};
const scrollStyle: React.CSSProperties = { overflow: 'auto', maxHeight: '70vh' };
const svgStyle: React.CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };
const nodeHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
  color: 'var(--cl-text-muted)',
};
const slotStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--cl-space-2)',
  fontSize: 'var(--cl-font-size-sm)',
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
  fontSize: 'var(--cl-font-size-xs)',
};
