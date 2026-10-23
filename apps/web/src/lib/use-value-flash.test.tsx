import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import { FLASH_DURATION_MS } from './value-flash.js';
import { useValueFlash } from './use-value-flash.js';

describe('useValueFlash', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not flash the value on its first render', () => {
    const { result } = renderHook(() => useValueFlash(2));

    expect(result.current).toBe(false);
  });

  it('flashes an increased value for one token cycle', () => {
    const { result, rerender } = renderHook(({ value }) => useValueFlash(value), {
      initialProps: { value: 2 },
    });

    rerender({ value: 3 });
    act(() => jest.advanceTimersByTime(0));
    expect(result.current).toBe(true);

    act(() => jest.advanceTimersByTime(FLASH_DURATION_MS - 1));
    expect(result.current).toBe(true);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('flashes a decrease so score corrections remain visible', () => {
    const { result, rerender } = renderHook(({ value }) => useValueFlash(value), {
      initialProps: { value: 3 },
    });

    rerender({ value: 2 });
    act(() => jest.advanceTimersByTime(0));

    expect(result.current).toBe(true);
  });
});
