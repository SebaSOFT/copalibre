import { useEffect, useRef, useState } from 'react';
import { ENTRY_DURATION_MS } from './entry-once.js';

/** Returns ids added after the first render for one entry-animation cycle. */
export function useEntryOnce(
  ids: readonly string[],
  initialIds: readonly string[] = ids,
): ReadonlySet<string> {
  const seen = useRef(new Set(initialIds));
  const timers = useRef(new Map<string, number>());
  const [entering, setEntering] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const current = new Set(ids);
    const added = [...current].filter((id) => !seen.current.has(id));
    seen.current = current;
    if (added.length === 0) return;

    setEntering((existing) => new Set([...existing, ...added]));
    for (const id of added) {
      const previousTimer = timers.current.get(id);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      const timer = window.setTimeout(() => {
        setEntering((existing) => {
          if (!existing.has(id)) return existing;
          const next = new Set(existing);
          next.delete(id);
          return next;
        });
        timers.current.delete(id);
      }, ENTRY_DURATION_MS);
      timers.current.set(id, timer);
    }
  }, [ids]);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  return entering;
}
