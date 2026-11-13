import { API_PATH_PREFIX } from './api-path.ts';

/** Same-origin public image routes that can be used in server and browser bundles. */
export function organizationEmblemUrl(organizationAlias: string): string {
  return `${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/emblem`;
}

export function clubEmblemUrl(organizationAlias: string, clubId: string): string {
  return `${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/emblem`;
}

/**
 * The widths the API renders an emblem at (`?width=`), and the stored original's own width, which
 * the browser falls back to when a rendition would be too small. Kept in step with the API's list.
 */
export const EMBLEM_RENDITION_WIDTHS = [64, 128, 256] as const;
const EMBLEM_ORIGINAL_WIDTH = 410;

const EMBLEM_ROUTE = new RegExp(
  `${API_PATH_PREFIX}/organizations/[^/?#]+(?:/(?:clubs|tournaments)/[^/?#]+)?/emblem(?:\\?[^#]*)?$`,
);

/**
 * A `srcset` of an emblem route's renditions plus its original, so the browser downloads the
 * smallest emblem that is sharp at the screen's density. Any other URL (an upload preview, a
 * `data:` image) gets none and is shown as it is.
 */
export function emblemSrcset(url: string): string | undefined {
  if (!EMBLEM_ROUTE.test(url)) return undefined;
  const separator = url.includes('?') ? '&' : '?';
  return [
    ...EMBLEM_RENDITION_WIDTHS.map((width) => `${url}${separator}width=${width} ${width}w`),
    `${url} ${EMBLEM_ORIGINAL_WIDTH}w`,
  ].join(', ');
}

const SIZES_LENGTH = /^\d+(?:\.\d+)?(?:px|vw|vh|vmin|vmax)$/;

/**
 * The `sizes` value for an emblem shown at `size` (a pixel count or a CSS length). A size
 * `sizes` cannot express (a percentage, `clamp()`) returns undefined: the caller then offers no
 * `srcset`, and the original is shown as before.
 */
export function emblemSizes(size: number | string): string | undefined {
  if (typeof size === 'number') return `${size}px`;
  return SIZES_LENGTH.test(size) ? size : undefined;
}
