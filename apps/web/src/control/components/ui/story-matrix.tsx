/**
 * The side-by-side view every library component ships alongside its controls
 * story (OpenSpec 0213, design.md Decision 3).
 *
 * A controls story lets a reviewer vary one prop at a time; it never puts two
 * variants on screen together, and a difference between two variants is only
 * visible next to each other. `StoryMatrix` renders the axes labelled, in a
 * grid that collapses to one column at the narrow widths the viewport selector
 * offers — including the 188px zoom floor, where a fixed-column grid would
 * overflow and hide the very failure the width is there to reveal.
 *
 * Lives at the root of `ui/` rather than in a tier directory: the tiers hold
 * library members, and every member is required to have a story.
 */
import type { ReactNode } from 'react';

export interface StoryMatrixCell {
  readonly label: string;
  readonly children: ReactNode;
}

export interface StoryMatrixProps {
  readonly cells: readonly StoryMatrixCell[];
  /** Widest a cell may get before the grid adds a column. */
  readonly minColumn?: string;
}

export function StoryMatrix({ cells, minColumn = '220px' }: StoryMatrixProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        // `min(100%, …)` so a cell never demands more width than the viewport
        // has — the same floor `cl-entity-card-grid` needs at 188px.
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minColumn}), 1fr))`,
        gap: 'var(--cl-space-4)',
        alignItems: 'start',
      }}
    >
      {cells.map((cell) => (
        <div key={cell.label} style={{ display: 'grid', gap: 'var(--cl-space-2)' }}>
          <span
            style={{
              color: 'var(--cl-text-secondary)',
              fontFamily: 'var(--cl-font-mono)',
              fontSize: 'var(--cl-font-size-xs)',
              textTransform: 'uppercase',
            }}
          >
            {cell.label}
          </span>
          {cell.children}
        </div>
      ))}
    </div>
  );
}
