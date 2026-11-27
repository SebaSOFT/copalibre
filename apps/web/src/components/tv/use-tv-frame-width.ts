import { useEffect, useState, type RefObject } from 'react';

/** The width of an element while it is observed, or undefined until it has been measured. */
export function useFrameWidth(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth || undefined));
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, ref]);
  return enabled ? width : undefined;
}
