import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { useIntl } from 'react-intl';
import { useToast } from '../ToastProvider.js';
import { messages } from '../../i18n/messages.en.js';
import { controlTokenStore } from '../../session/token-store.js';

export type ResilientReadStatus = 'loading' | 'ready' | 'stale' | 'failed-empty' | 'empty';

export interface ResilientReadOptions<T> {
  readonly thing: string;
  readonly isEmpty?: (value: T) => boolean;
  readonly enabled?: boolean;
  readonly onSuccess?: (data: T) => void;
}

export interface ResilientReadState<T> {
  readonly status: ResilientReadStatus;
  readonly data?: T;
  /** Timestamp of the last successful read, used to show the age of stale data. */
  readonly staleSince?: number;
  readonly error?: unknown;
  readonly retry: () => void;
  readonly refresh: () => Promise<T | undefined>;
  readonly update: (value: SetStateAction<T>) => void;
}

interface CachedRead {
  readonly data: unknown;
  readonly updatedAt: number;
}

type KeyedReadState<T> = Omit<ResilientReadState<T>, 'retry' | 'refresh' | 'update'> & {
  readonly key: string;
};

const successfulReads = new Map<string, CachedRead>();
const retrySchedule = [2_000, 4_000, 8_000, 16_000, 30_000] as const;

export function clearResilientReadCache(): void {
  successfulReads.clear();
}

export function replaceResilientReadCache<T>(key: string, data: T): void {
  cacheRead(scopedReadKey(key), data);
}

function scopedReadKey(key: string): string {
  return JSON.stringify([controlTokenStore.read(), key]);
}

function cacheRead<T>(key: string, data: T): void {
  successfulReads.set(key, { data, updatedAt: Date.now() });
}

function emptyResult<T>(value: T): boolean {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0);
}

function initialState<T>(key: string, isEmpty: (value: T) => boolean): KeyedReadState<T> {
  const cached = successfulReads.get(key) as CachedRead | undefined;
  if (cached === undefined) return { key, status: 'loading' };
  const data = cached.data as T;
  return {
    key,
    status: isEmpty(data) ? 'empty' : 'ready',
    data,
  };
}

/** Keeps successful reads visible while retrying failed control-panel requests. */
export function useResilientRead<T>(
  resourceKey: string,
  fetcher: () => Promise<T>,
  options: ResilientReadOptions<T>,
): ResilientReadState<T> {
  const key = scopedReadKey(resourceKey);
  const intl = useIntl();
  const { dismiss, push } = useToast();
  const isEmptyRef = useRef(options.isEmpty ?? emptyResult<T>);
  const fetcherRef = useRef(fetcher);
  const thingRef = useRef(options.thing);
  const onSuccessRef = useRef(options.onSuccess);
  isEmptyRef.current = options.isEmpty ?? emptyResult<T>;
  fetcherRef.current = fetcher;
  thingRef.current = options.thing;
  onSuccessRef.current = options.onSuccess;

  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState<KeyedReadState<T>>(() =>
    initialState(key, isEmptyRef.current),
  );
  const retryAttempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastId = useRef<string | undefined>(undefined);
  const runRef = useRef<() => Promise<T | undefined>>(async () => undefined);
  const refresh = useCallback(() => runRef.current(), []);

  const retry = useCallback(() => {
    if (retryTimer.current !== undefined) clearTimeout(retryTimer.current);
    retryTimer.current = undefined;
    retryAttempt.current = 0;
    setRetryVersion((current) => current + 1);
  }, []);

  const update = useCallback(
    (value: SetStateAction<T>) => {
      const cached = successfulReads.get(key);
      const data =
        typeof value === 'function' ? (value as (current: T) => T)(cached?.data as T) : value;
      cacheRead(key, data);
      setState({ key, data, status: isEmptyRef.current(data) ? 'empty' : 'ready' });
    },
    [key],
  );

  useEffect(() => {
    let active = true;
    let generation = 0;
    retryAttempt.current = 0;

    const run = async (): Promise<T | undefined> => {
      const requestGeneration = ++generation;
      if (retryTimer.current !== undefined) clearTimeout(retryTimer.current);
      retryTimer.current = undefined;
      try {
        const data = await fetcherRef.current();
        if (!active) return undefined;
        if (requestGeneration !== generation) return data;

        cacheRead(key, data);
        retryAttempt.current = 0;
        if (toastId.current !== undefined) {
          dismiss(toastId.current);
          toastId.current = undefined;
        }
        setState({
          key,
          status: isEmptyRef.current(data) ? 'empty' : 'ready',
          data,
        });
        onSuccessRef.current?.(data);
        return data;
      } catch (error) {
        if (!active || requestGeneration !== generation) return undefined;

        const cached = successfulReads.get(key) as CachedRead | undefined;
        const delay =
          retrySchedule[Math.min(retryAttempt.current, retrySchedule.length - 1)] ?? 30_000;
        retryAttempt.current += 1;
        setState(
          cached === undefined
            ? { key, status: 'failed-empty', error }
            : {
                key,
                status: 'stale',
                data: cached.data as T,
                staleSince: cached.updatedAt,
                error,
              },
        );

        if (toastId.current !== undefined) dismiss(toastId.current);
        toastId.current = push({
          severity: 'error',
          message: intl.formatMessage(messages.interactionReadFailed, {
            thing: thingRef.current,
            seconds: delay / 1_000,
          }),
          action: {
            label: intl.formatMessage(messages.interactionRetry),
            onAction: retry,
          },
        });
        retryTimer.current = setTimeout(() => {
          retryTimer.current = undefined;
          void run();
        }, delay);
        return undefined;
      }
    };

    runRef.current = run;
    if (options.enabled !== false) void run();
    return () => {
      active = false;
      runRef.current = async () => undefined;
      if (retryTimer.current !== undefined) clearTimeout(retryTimer.current);
      retryTimer.current = undefined;
      if (toastId.current !== undefined) {
        dismiss(toastId.current);
        toastId.current = undefined;
      }
    };
  }, [dismiss, intl, key, options.enabled, push, retry, retryVersion]);

  const visibleState = state.key === key ? state : initialState(key, isEmptyRef.current);
  return {
    status: visibleState.status,
    data: visibleState.data,
    staleSince: visibleState.staleSince,
    error: visibleState.error,
    retry,
    refresh,
    update,
  };
}
