import { useId, type ReactNode } from 'react';
import { Popover } from './Popover.js';

/**
 * A table column header, optionally sortable and optionally described.
 *
 * The label is the sort button and the information icon is its sibling:
 * nesting two interactive elements is invalid markup, and a click has to keep
 * meaning "sort". `aria-describedby` links the sort button to a hidden copy of
 * the description, so a screen reader announces it on focus without folding it
 * into the button's own accessible name.
 */
export function ColumnHeaderTooltip({
  label,
  description,
  infoLabel,
  indicator,
  onClick,
  className,
}: {
  readonly label: string;
  readonly description?: string;
  /** The information icon's accessible name, required with a description. */
  readonly infoLabel?: string;
  /** The sort-direction glyph, rendered after the label — absent for an unsorted or unsortable column. */
  readonly indicator?: ReactNode;
  /** Absent for a described-but-unsortable column: the button still focuses, it just does nothing on click. */
  readonly onClick?: () => void;
  readonly className?: string;
}): React.JSX.Element {
  const descriptionId = useId();
  return (
    <span className={`cl-column-header-tooltip ${className ?? ''}`.trim()}>
      <button
        aria-describedby={description === undefined ? undefined : descriptionId}
        className="cl-column-header"
        onClick={onClick}
        type="button"
      >
        {label}
        {indicator}
      </button>
      {description !== undefined && (
        <>
          <span className="cl-visually-hidden" id={descriptionId}>
            {description}
          </span>
          <Popover openOnHover triggerLabel={infoLabel ?? label}>
            {description}
          </Popover>
        </>
      )}
    </span>
  );
}
