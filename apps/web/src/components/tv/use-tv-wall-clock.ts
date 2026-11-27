import { useEffect, useState } from 'react';
import type { SupportedLanguage } from '@copalibre/domain';
import { formatTimestamp } from '../../lib/format-timestamp.js';
import { timeZoneLabel } from './tv-dashboard-model.js';

/**
 * The wall clock, to the minute, in the organization's zone, and the effective "now" the dashboard reads
 * its countdowns and scheduled times against. It ticks every 15 seconds.
 */
export function useTvWallClock({
  language,
  timeZone,
  referenceDate,
}: {
  readonly language: SupportedLanguage;
  readonly timeZone: string | undefined;
  readonly referenceDate: number | undefined;
}): {
  readonly currentTime: string;
  readonly clockZoneLabel: string | undefined;
  readonly effectiveNow: number;
} {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [clockZoneLabel, setClockZoneLabel] = useState<string | undefined>(undefined);
  const [effectiveNow, setEffectiveNow] = useState<number>(() => referenceDate ?? Date.now());
  useEffect(() => {
    const updateClock = (tickNow: boolean) => {
      const now = new Date();
      setCurrentTime(formatTimestamp(now, { locale: language, format: 'time-only', timeZone }));
      setClockZoneLabel(timeZone ? timeZoneLabel(now, language, timeZone) : undefined);
      if (tickNow) setEffectiveNow(now.getTime());
    };
    updateClock(false);
    const timer = setInterval(() => updateClock(true), 15_000);
    return () => clearInterval(timer);
  }, [language, timeZone]);

  return { currentTime, clockZoneLabel, effectiveNow };
}
