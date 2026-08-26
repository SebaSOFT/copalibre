import { useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';

/**
 * The shared 410×512 profile-image frame — an organization emblem,
 * club emblem, or person photo, or its placeholder when none is uploaded
 * yet, all inside the same `.cl-image-frame--control` chamfer. `size` sets
 * the frame's width in pixels; `aspect-ratio: 4/5` (from the generated
 * stylesheet) derives the height, so callers no longer size width and
 * height independently the way previous `<img>`s did.
 */
export interface FramedImageProps {
  readonly src: string | undefined;
  readonly alt: string;
  readonly placeholder: ReactNode;
  readonly size?: number;
  readonly onError?: () => void;
}

export function FramedImage({
  src,
  alt,
  placeholder,
  size = 64,
  onError,
}: FramedImageProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const style: CSSProperties = { width: size };

  if (src === undefined || failed) {
    return (
      <div className="cl-image-frame cl-image-frame--control" style={style}>
        {placeholder}
      </div>
    );
  }

  return (
    <div className="cl-image-frame cl-image-frame--control" style={style}>
      <img
        alt={alt}
        src={src}
        onError={() => {
          setFailed(true);
          onError?.();
        }}
      />
    </div>
  );
}
