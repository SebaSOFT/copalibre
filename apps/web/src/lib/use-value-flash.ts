import { useEffect, useRef, useState } from 'react';
import { FLASH_DURATION_MS } from './value-flash.js';

/** Returns true for one flash cycle after a mounted value changes. */
export function useValueFlash(value: number | string | null | undefined): boolean {
  const previous = useRef(value);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    setFlashing(false);
    const restart = window.setTimeout(() => setFlashing(true), 0);
    const clear = window.setTimeout(() => setFlashing(false), FLASH_DURATION_MS);
    return () => {
      window.clearTimeout(restart);
      window.clearTimeout(clear);
    };
  }, [value]);

  return flashing;
}
