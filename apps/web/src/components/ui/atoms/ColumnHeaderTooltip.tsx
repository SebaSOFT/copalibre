import { useId, type ReactNode } from 'react';

/**
 * A table column header, optionally sortable and optionally described.
 *
 * One `<button>` carries both behaviours rather than a sort trigger nested
 * inside a separate description trigger — nesting two interactive elements is
 * invalid markup, and the header is one control either way: activating it
 * sorts, focusing or hovering it reveals what the column means.
 * `aria-describedby` links the button to the bubble so a screen reader
 * announces the description on focus without folding it into the button's own
 * accessible name.
 */
export function ColumnHeaderTooltip({
  label,
  description,
  indicator,
  onClick,
  className,
}: {
  readonly label: string;
  readonly description?: string;
  /** The sort-direction glyph, rendered after the label — absent for an unsorted or unsortable column. */
  readonly indicator?: ReactNode;
  /** Absent for a described-but-unsortable column: the button still focuses, it just does nothing on click. */
  readonly onClick?: () => void;
  readonly className?: string;
}): React.JSX.Element {
  const bubbleId = useId();
  return (
    <span className={`cl-column-header-tooltip ${className ?? ''}`.trim()}>
      <button
        aria-describedby={description === undefined ? undefined : bubbleId}
        className="cl-column-header cl-column-header-tooltip__trigger"
        onClick={onClick}
        type="button"
      >
        {label}
        {indicator}
      </button>
      {description !== undefined && (
        <span className="cl-column-header-tooltip__bubble" id={bubbleId} role="tooltip">
          {description}
        </span>
      )}
    </span>
  );
}
