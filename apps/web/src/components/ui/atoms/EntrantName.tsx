import { resultStateGlyph } from '../../../lib/result-state.js';
import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a tournament entrant identifiable in narrow surfaces without inventing
 * another label: resolved entrants use persisted abbreviations; pending sources
 * use the localized compact wording their caller supplies.
 */
export function EntrantName({
  fullName,
  abbreviation,
  className,
  inline = false,
  pending = false,
  compact: preferCompact = false,
}: {
  readonly fullName: string;
  readonly abbreviation?: string;
  readonly className?: string;
  /** Flow within surrounding text, inheriting its font, size and emphasis. */
  readonly inline?: boolean;
  readonly pending?: boolean;
  /** Explicit dense presentations remain meaningful before hydration. */
  readonly compact?: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  const showAbbreviation = (compact || preferCompact) && abbreviation !== undefined;

  useEffect(() => {
    const element = ref.current;
    if (!element || abbreviation === undefined || typeof ResizeObserver === 'undefined') return;
    const update = (): void => setCompact(element.scrollWidth > element.clientWidth);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [abbreviation, fullName]);

  return (
    <span
      className={`cl-entrant-name ${inline ? 'cl-entrant-name--inline' : ''} ${pending ? 'cl-entrant-name--pending' : ''} ${className ?? ''}`.trim()}
      data-testid="entrant-name"
      ref={ref}
      aria-label={fullName}
      title={showAbbreviation ? undefined : fullName}
    >
      {pending && (
        <>
          <span aria-hidden="true">{resultStateGlyph('upcoming')}</span>{' '}
        </>
      )}
      {showAbbreviation ? <abbr title={fullName}>{abbreviation}</abbr> : fullName}
    </span>
  );
}
