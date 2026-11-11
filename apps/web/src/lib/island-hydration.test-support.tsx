import { jest } from '@jest/globals';
import { act, type ReactElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server.node';

/**
 * Renders an island the way Astro's server does (Node's renderer, as Astro
 * uses), with no `matchMedia`, then
 * hydrates that markup in a browser that prefers reduced motion. Reports every
 * hydration complaint React makes: recoverable errors (a mismatch it repairs by
 * re-rendering) and the development warning for a mismatched attribute, which
 * production stays silent about.
 */
export interface HydratedIsland {
  readonly container: HTMLElement;
  readonly hydrationErrors: readonly string[];
  unmount(): void;
}

function reducedMotionMedia(query: string): MediaQueryList {
  return {
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as MediaQueryList;
}

export async function hydrateWithReducedMotion(element: ReactElement): Promise<HydratedIsland> {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const setMatchMedia = (value: unknown): void => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value });
  };

  setMatchMedia(undefined);
  const html = renderToString(element);
  setMatchMedia(reducedMotionMedia);

  const hydrationErrors: string[] = [];
  const consoleError = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = args.map(String).join(' ');
    if (/hydrat/i.test(message)) hydrationErrors.push(message);
  });
  const container = document.createElement('div');
  // Parsed, not assigned: the HTML sink check keeps `innerHTML` out of web code, tests included.
  container.append(...new DOMParser().parseFromString(html, 'text/html').body.childNodes);
  document.body.appendChild(container);

  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, element, {
        onRecoverableError: (error) => hydrationErrors.push(String(error)),
      });
    });
  } finally {
    consoleError.mockRestore();
  }

  return {
    container,
    hydrationErrors,
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
      if (original) Object.defineProperty(window, 'matchMedia', original);
      else Reflect.deleteProperty(window, 'matchMedia');
    },
  };
}
