import { act, renderHook, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { IntlProvider } from 'react-intl';
import { ToastProvider } from '../ToastProvider.js';
import { useResilientRead } from './use-resilient-read.js';
import { controlTokenStore } from '../../session/token-store.js';

function wrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <IntlProvider locale="en">
      <ToastProvider>{children}</ToastProvider>
    </IntlProvider>
  );
}

describe('useResilientRead', () => {
  afterEach(() => jest.useRealTimers());

  it('updates the last good value after a mutation and retains it during a failed refresh', async () => {
    const fetcher = jest
      .fn<() => Promise<readonly string[]>>()
      .mockResolvedValueOnce(['Old'])
      .mockRejectedValue(new Error('offline'));
    const onSuccess = jest.fn();
    const { result } = renderHook(
      () => useResilientRead('updated', fetcher, { thing: 'tournaments', onSuccess }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual(['Old']));
    act(() => result.current.update((current) => [...current, 'Created']));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toBe('stale');
    expect(result.current.data).toEqual(['Old', 'Created']);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current).not.toHaveProperty('key');
    act(() => result.current.update(['Replacement']));
    expect(result.current.data).toEqual(['Replacement']);
  });

  it('supports an on-demand read without fetching automatically', async () => {
    const fetcher = jest.fn<() => Promise<string>>().mockResolvedValue('Loaded');
    const { result, rerender } = renderHook(
      ({ enabled }) => useResilientRead('on-demand', fetcher, { thing: 'diagnostics', enabled }),
      { wrapper, initialProps: { enabled: false } },
    );
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
      expect(await result.current.refresh()).toBe('Loaded');
    });
    expect(result.current.data).toBe('Loaded');
    rerender({ enabled: true });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('returns an older acknowledgement read without overwriting a newer projection', async () => {
    const resolve: ((value: number) => void)[] = [];
    const fetcher = () => new Promise<number>((done) => resolve.push(done));
    const { result } = renderHook(
      () => useResilientRead('projection-race', fetcher, { thing: 'match' }),
      { wrapper },
    );
    let second: Promise<number | undefined> | undefined;
    act(() => {
      second = result.current.refresh();
    });
    await act(async () => {
      resolve[1]?.(2);
      await second;
    });
    await act(async () => {
      resolve[0]?.(1);
      await Promise.resolve();
    });
    expect(result.current.data).toBe(2);
  });

  it('does not expose cached data after the authenticated session changes', async () => {
    controlTokenStore.write('session-one', Date.now() + 60_000);
    try {
      const fetcher = jest
        .fn<() => Promise<string[]>>()
        .mockResolvedValueOnce(['Private data'])
        .mockRejectedValue(new Error('offline'));
      const { result, rerender } = renderHook(
        () => useResilientRead('private-data', fetcher, { thing: 'tokens' }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.data).toEqual(['Private data']));
      controlTokenStore.write('session-two', Date.now() + 60_000);
      rerender();
      expect(result.current.data).toBeUndefined();
      await waitFor(() => expect(result.current.status).toBe('failed-empty'));
      expect(result.current.data).toBeUndefined();
    } finally {
      controlTokenStore.clear();
    }
  });

  it('moves from loading to ready, keeps prior data stale, then returns to ready', async () => {
    const fetcher = jest
      .fn<() => Promise<readonly string[]>>()
      .mockResolvedValueOnce(['Tournament'])
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(['Updated tournament']);
    const { result } = renderHook(
      () => useResilientRead('ready-stale-ready', fetcher, { thing: 'tournaments' }),
      { wrapper },
    );

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual(['Tournament']);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('stale'));
    expect(result.current.data).toEqual(['Tournament']);
    expect(result.current.staleSince).toEqual(expect.any(Number));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.data).toEqual(['Updated tournament']));
    expect(result.current.status).toBe('ready');
  });

  it('distinguishes a successful empty result from a first-load failure', async () => {
    const emptyFetcher = jest.fn<() => Promise<readonly string[]>>().mockResolvedValue([]);
    const emptyRead = renderHook(
      () => useResilientRead('empty-result', emptyFetcher, { thing: 'tournaments' }),
      { wrapper },
    );
    await waitFor(() => expect(emptyRead.result.current.status).toBe('empty'));
    expect(emptyRead.result.current.data).toEqual([]);
    emptyRead.unmount();

    const failingFetcher = jest
      .fn<() => Promise<readonly string[]>>()
      .mockRejectedValue(new Error('Network error'));
    const failedRead = renderHook(
      () => useResilientRead('first-load-failure', failingFetcher, { thing: 'tournaments' }),
      { wrapper },
    );
    await waitFor(() => expect(failedRead.result.current.status).toBe('failed-empty'));
    expect(failedRead.result.current.data).toBeUndefined();
  });

  it('follows the 2, 4, 8, 16 and 30 second backoff, then holds at 30', async () => {
    jest.useFakeTimers();
    const fetcher = jest
      .fn<() => Promise<readonly string[]>>()
      .mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(
      () => useResilientRead('retry-schedule', fetcher, { thing: 'tournaments' }),
      { wrapper },
    );

    await act(async () => Promise.resolve());
    expect(result.current.status).toBe('failed-empty');
    expect(fetcher).toHaveBeenCalledTimes(1);

    let expectedCalls = 1;
    for (const delay of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(delay);
      });
      expectedCalls += 1;
      expect(fetcher).toHaveBeenCalledTimes(expectedCalls);
      expect(result.current.status).toBe('failed-empty');
    }
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it('manual retry starts immediately and resets the backoff to two seconds', async () => {
    jest.useFakeTimers();
    const fetcher = jest
      .fn<() => Promise<readonly string[]>>()
      .mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(
      () => useResilientRead('manual-retry', fetcher, { thing: 'tournaments' }),
      { wrapper },
    );

    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledTimes(2);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_999);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
