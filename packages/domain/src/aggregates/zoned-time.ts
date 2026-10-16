/**
 * Wall-clock arithmetic in an IANA zone.
 *
 * A "wall clock" here is the zone's local date and time encoded as if it were UTC
 * (`Date.UTC(year, month, day, hour, minute)`), so local minutes can be added with plain
 * arithmetic and converted back to an instant only at the end. Stepping in instants instead
 * shifts every local time by an hour across a daylight-saving change.
 */

const MINUTE = 60_000;
/** Far enough to land on both sides of any one transition; zones never change twice this fast. */
const PROBE = 14 * 60 * MINUTE;
/** The longest a spring-forward gap lasts in any zone in use. */
const LONGEST_GAP_MINUTES = 3 * 60;

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

/** The zone's wall clock at an instant. */
export function wallClockOf(epoch: number, timeZone: string): number {
  return epoch + offsetAt(epoch, timeZone);
}

/**
 * The instant a wall clock denotes: the first occurrence when a fall-back repeats it, and
 * `undefined` when a spring-forward skips it.
 */
export function epochOfWallClock(wallClock: number, timeZone: string): number | undefined {
  const candidates = new Set([
    wallClock - offsetAt(wallClock - PROBE, timeZone),
    wallClock - offsetAt(wallClock + PROBE, timeZone),
  ]);
  const valid = [...candidates].filter((epoch) => wallClockOf(epoch, timeZone) === wallClock);
  return valid.length === 0 ? undefined : Math.min(...valid);
}

/**
 * The instant of a wall clock, or of the next valid local minute when a spring-forward gap
 * swallows it — the slot a schedule meant to start then starts as soon as the clock allows.
 */
export function epochOfWallClockOrNext(wallClock: number, timeZone: string): number {
  for (let minutes = 0; minutes <= LONGEST_GAP_MINUTES; minutes += 1) {
    const epoch = epochOfWallClock(wallClock + minutes * MINUTE, timeZone);
    if (epoch !== undefined) return epoch;
  }
  throw new RangeError(`no valid local time within ${LONGEST_GAP_MINUTES} minutes in ${timeZone}`);
}

/** The instant a wall-clock time (`2025-11-02T11:15`) denotes in an IANA zone. */
export function localToEpoch(local: string, timeZone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) throw new Error(`unreadable local time "${local}"`);
  const [, year, month, day, hour, minute, second] = match;
  return epochOfWallClockOrNext(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? 0),
    ),
    timeZone,
  );
}
