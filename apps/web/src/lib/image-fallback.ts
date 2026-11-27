/**
 * Swaps a broken image for the fallback element that follows it (an emblem's
 * monogram, a person's placeholder). It replaces inline `onerror` attributes,
 * which the Content Security Policy blocks: inline event handlers are scripts
 * the build cannot hash.
 *
 * A module runs after parsing, so an image may already have failed by then;
 * those are found by `complete` with no natural width. Later failures arrive
 * through one capturing listener, since `error` does not bubble.
 */

export const IMAGE_FALLBACK_ATTRIBUTE = 'data-image-fallback';

export function showImageFallback(image: HTMLImageElement): void {
  image.style.display = 'none';
  const fallback = image.nextElementSibling;
  if (fallback instanceof HTMLElement) fallback.style.display = '';
}

function isFallbackImage(target: EventTarget | null): target is HTMLImageElement {
  return target instanceof HTMLImageElement && target.hasAttribute(IMAGE_FALLBACK_ATTRIBUTE);
}

let installed = false;

export function installImageFallback(root: Document = document): void {
  if (installed) return;
  installed = true;
  root.addEventListener(
    'error',
    (event) => {
      if (isFallbackImage(event.target)) showImageFallback(event.target);
    },
    true,
  );
  for (const image of root.querySelectorAll<HTMLImageElement>(`img[${IMAGE_FALLBACK_ATTRIBUTE}]`)) {
    if (image.complete && image.naturalWidth === 0 && image.getAttribute('src')) {
      showImageFallback(image);
    }
  }
}

/** Test seam: lets a test install the listener again on a fresh document. */
export function resetImageFallbackForTests(): void {
  installed = false;
}
