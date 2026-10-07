/** Milliseconds a zone is ahead of UTC at an instant. */
function offsetAt(epoch: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(epoch));
  const part = (type: string): number => Number(parts.find((entry) => entry.type === type)?.value);
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return local - Math.floor(epoch / 1000) * 1000;
}

/**
 * The instant a wall-clock time (`2025-11-02T11:15`) denotes in an IANA zone. A fixed offset would be wrong for
 * any zone with daylight saving, so the offset is read from `Intl` at the candidate instant and corrected once.
 */
export function localToEpoch(local: string, timeZone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) throw new Error(`unreadable local time "${local}"`);
  const [, year, month, day, hour, minute, second] = match;
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0),
  );
  const first = wallClock - offsetAt(wallClock, timeZone);
  return wallClock - offsetAt(first, timeZone);
}
