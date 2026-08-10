import { renderHook, act } from '@testing-library/react';
import { navigateControl, useControlPath } from './control-navigation.js';

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
