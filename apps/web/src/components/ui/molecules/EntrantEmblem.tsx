import { useEffect, useRef, useState } from 'react';
import { emblemMonogramFit } from '../../../lib/entrant-emblem.js';
import { Icon } from '../atoms/icon.js';

/**
 * Entrant emblem with the stored abbreviation or shield fallback.
 *
 * @level Molecule
 * @composition Icon
 */
export function EntrantEmblem({
  abbreviation,
  alt,
  bare = false,
  className = '',
  decorative = false,
  size = 48,
  src,
  control = false,
}: {
  readonly abbreviation?: string;
  readonly alt: string;
  readonly bare?: boolean;
  readonly className?: string;
  readonly control?: boolean;
  readonly decorative?: boolean;
  readonly size?: number | string;
  readonly src?: string;
}): React.JSX.Element {
  const [failedSrc, setFailedSrc] = useState<string>();
  const imageRef = useRef<HTMLImageElement>(null);
  const imageVisible = src !== undefined && failedSrc !== src;
  const hiddenFromAssistiveTechnology = bare || decorative;
  const fit = emblemMonogramFit(abbreviation);
  const abbreviationLength = Array.from(abbreviation ?? '').length;

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setFailedSrc(src);
  }, [src]);
  const classes = [
    'cl-image-frame',
    'cl-entrant-emblem',
    control && 'cl-image-frame--control',
    typeof size === 'number' && size <= 32 && 'cl-entrant-emblem--small',
    typeof size === 'number' && size <= 24 && 'cl-entrant-emblem--micro',
    bare && 'cl-entrant-emblem--bare',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      aria-hidden={hiddenFromAssistiveTechnology ? 'true' : undefined}
      aria-label={hiddenFromAssistiveTechnology ? undefined : alt}
      className={classes}
      role={hiddenFromAssistiveTechnology ? undefined : 'img'}
      style={
        {
          '--entrant-emblem-size': typeof size === 'number' ? `${size}px` : size,
        } as React.CSSProperties
      }
    >
      {imageVisible ? (
        <img alt="" onError={() => setFailedSrc(src)} ref={imageRef} src={src} />
      ) : (
        <span aria-hidden="true" className="cl-entrant-emblem__fallback">
          {fit && abbreviation !== undefined ? (
            <span
              className={[
                'cl-entrant-emblem__monogram',
                fit === 'reduced' && 'cl-entrant-emblem__monogram--reduced',
                fit === 'figure' &&
                  abbreviationLength === 4 &&
                  typeof size === 'number' &&
                  size <= 32 &&
                  'cl-entrant-emblem__monogram--small-tight',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {abbreviation}
            </span>
          ) : (
            <Icon name="club" size={24} />
          )}
        </span>
      )}
    </span>
  );
}
