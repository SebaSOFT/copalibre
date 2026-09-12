import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a tournament entrant identifiable in narrow surfaces without inventing
 * another label: only the persisted abbreviation may replace the full name.
 */
export function EntrantName({
  fullName,
  abbreviation,
  className,
}: {
  readonly fullName: string;
  readonly abbreviation?: string;
  readonly className?: string;
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);

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
      className={`cl-entrant-name ${className ?? ''}`.trim()}
      data-testid="entrant-name"
      ref={ref}
    >
      {compact && abbreviation !== undefined ? (
        <abbr title={fullName}>{abbreviation}</abbr>
      ) : (
        fullName
      )}
    </span>
  );
}
