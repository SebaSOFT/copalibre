/**
 * The summary tile, given an owner.
 *
 * `.cl-stat-tile` has been in the generated stylesheet since the dashboard
 * needed it, but every consumer hand-wrote the class and its inner markup, so
 * "a tile with no value" was a decision each of them made separately — and the
 * usual answer was a dash that reads exactly like a measured zero.
 *
 * This makes the unavailable state the component's own: a value or an explicit
 * word, never a placeholder number, and set in the muted body role rather than
 * the display face a figure gets, so the two are distinguishable at a glance.
 */
import type { ReactNode } from 'react';

export interface StatTileProps {
  /** What is being measured. */
  readonly label: string;
  /**
   * The measurement. Absent means unmeasured, and renders as such — a caller
   * that passes `0` is stating a real zero, which is a different claim.
   */
  readonly value?: ReactNode;
  /** Names the absence. Required in practice wherever a value can be missing. */
  readonly unavailableLabel?: string;
  /**
   * Marks a figure as a demonstration. The workbench sets this; a production
   * surface never does, which is what keeps fixture numbers from being read as
   * measurements.
   */
  readonly demonstrationLabel?: string;
  readonly className?: string;
}

export function StatTile({
  label,
  value,
  unavailableLabel,
  demonstrationLabel,
  className = '',
}: StatTileProps): React.JSX.Element {
  const available = value !== undefined && value !== null;
  return (
    <div className={`cl-stat-tile cl-chamfer cl-chamfer--control ${className}`.trim()}>
      {available ? (
        <div className="cl-stat-tile__value">{value}</div>
      ) : (
        <div className="cl-metric-strip__unavailable">{unavailableLabel}</div>
      )}
      <div className="cl-metric-strip__label">{label}</div>
      {demonstrationLabel !== undefined && (
        <span className="cl-metric-strip__demonstration">{demonstrationLabel}</span>
      )}
    </div>
  );
}
