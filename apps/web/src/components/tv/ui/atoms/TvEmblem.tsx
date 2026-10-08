import { useEffect, useRef, useState } from 'react';

/**
 * A club emblem that gives way to its fallback (the club's monogram) when there is no emblem or
 * the request fails. A failure that happens before hydration never reaches `onError`, so the
 * effect also checks the already-settled image.
 */
export function TvEmblem({
  src,
  alt,
  className,
  fallback,
}: {
  readonly src?: string | undefined;
  readonly alt: string;
  readonly className: string;
  readonly fallback: React.ReactNode;
}): React.JSX.Element {
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setFailedSrc(src);
  }, [src]);

  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    <img alt={alt} className={className} onError={() => setFailedSrc(src)} ref={image} src={src} />
  );
}
