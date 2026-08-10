import { renderHook, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { MouseEvent } from 'react';
import { controlLinkClick, navigateControl, useControlPath } from './control-navigation.js';

function clickEvent(
  overrides: Partial<
    Pick<MouseEvent<HTMLAnchorElement>, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>
  > = {},
): MouseEvent<HTMLAnchorElement> {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: jest.fn(),
    ...overrides,
  } as unknown as MouseEvent<HTMLAnchorElement>;
}

describe('control-panel client-side navigation', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/control/liga-mendocina');
  });

  it('reports the current path on mount', () => {
    window.history.replaceState({}, '', '/control/liga-mendocina/roles');
    const { result } = renderHook(() => useControlPath());
    expect(result.current).toBe('/control/liga-mendocina/roles');
  });

  it('updates the path without a page reload when navigating', () => {
    window.history.replaceState({}, '', '/control/liga-mendocina');
    const { result } = renderHook(() => useControlPath());
    expect(result.current).toBe('/control/liga-mendocina');

    act(() => {
      navigateControl('/control/liga-mendocina/roles');
    });

    expect(result.current).toBe('/control/liga-mendocina/roles');
    expect(window.location.pathname).toBe('/control/liga-mendocina/roles');
  });

  it('does nothing when navigating to the current path', () => {
    window.history.replaceState({}, '', '/control/liga-mendocina/roles');
    const lengthBefore = window.history.length;

    navigateControl('/control/liga-mendocina/roles');

    expect(window.history.length).toBe(lengthBefore);
  });

  it('reacts to browser back/forward (popstate)', () => {
    window.history.replaceState({}, '', '/control/liga-mendocina');
    const { result } = renderHook(() => useControlPath());

    act(() => {
      navigateControl('/control/liga-mendocina/roles');
    });
    expect(result.current).toBe('/control/liga-mendocina/roles');

    act(() => {
      window.history.pushState({}, '', '/control/liga-mendocina');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current).toBe('/control/liga-mendocina');
  });
});

describe('controlLinkClick', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/control/liga-mendocina');
  });

  it('intercepts a plain left click into client-side navigation', () => {
    window.history.replaceState({}, '', '/control/liga-mendocina');
    const event = clickEvent();

    controlLinkClick('/control/liga-mendocina/roles')(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/control/liga-mendocina/roles');
  });

  it.each([
    ['a non-primary button', clickEvent({ button: 1 })],
    ['a meta-key click (open in new tab)', clickEvent({ metaKey: true })],
    ['a ctrl-key click', clickEvent({ ctrlKey: true })],
    ['a shift-key click (open in new window)', clickEvent({ shiftKey: true })],
    ['an alt-key click', clickEvent({ altKey: true })],
  ])('leaves the browser default behavior alone for %s', (_label, event) => {
    window.history.replaceState({}, '', '/control/liga-mendocina');

    controlLinkClick('/control/liga-mendocina/roles')(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/control/liga-mendocina');
  });
});
