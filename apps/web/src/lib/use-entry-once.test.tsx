import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MOTION } from '@copalibre/design-tokens';
import { useEntryOnce } from './use-entry-once.js';

const ENTRY_DURATION_MS = Number(MOTION.base.replace(/ms$/, ''));

describe('useEntryOnce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('leaves initial items still and marks only newly added ids for one cycle', () => {
    const { result, rerender } = renderHook(
      ({ ids }: { readonly ids: readonly string[] }) => useEntryOnce(ids),
      { initialProps: { ids: ['existing'] } },
    );
    expect(result.current.size).toBe(0);

    rerender({ ids: ['existing', 'new-event'] });
    expect(result.current.has('existing')).toBe(false);
    expect(result.current.has('new-event')).toBe(true);

    act(() => jest.advanceTimersByTime(ENTRY_DURATION_MS - 1));
    expect(result.current.has('new-event')).toBe(true);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.has('new-event')).toBe(false);
  });
});
