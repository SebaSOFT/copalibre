import type { ReactNode } from 'react';
import { spaceVar, type SpacingStep } from './spacing.js';

/** The declared column counts — a small controlled set, not an arbitrary integer. */
export const GRID_COLUMNS = [1, 2, 3, 4, 6, 12] as const;
export type GridColumnCount = (typeof GRID_COLUMNS)[number];

export interface GridProps {
  readonly children: ReactNode;
  /** How many equal-width columns the grid divides into. */
  readonly columns?: GridColumnCount;
  /** Gap between cells, a token-scale step, applied to both axes. */
  readonly gap?: SpacingStep;
  /** Padding on all sides, a token-scale step. */
  readonly padding?: SpacingStep;
  readonly className?: string;
}

/** A grid layout primitive: a fixed column count and a token-scale gap, never a raw track list. */
export function Grid({
  children,
  columns = 1,
  gap = '0',
  padding,
  className = '',
}: GridProps): React.JSX.Element {
  return (
    <div
      className={`cl-grid ${className}`.trim()}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: spaceVar(gap),
        ...(padding ? { padding: spaceVar(padding) } : {}),
      }}
    >
      {children}
    </div>
  );
}
