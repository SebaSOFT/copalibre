/** Wall-clock conversion now lives in the domain, shared with schedule slot generation. */
export { localToEpoch } from '@copalibre/domain';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` that names a real calendar day. */
export function isCalendarDate(value: string): boolean {
  const parts = DATE.exec(value);
  if (!parts) return false;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** The calendar date an instant falls on in a time zone, as `YYYY-MM-DD`. */
export function localDateOf(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Whole calendar days from one `YYYY-MM-DD` to another. */
export function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/**
 * A wall-clock `YYYY-MM-DDTHH:mm` moved by whole calendar days, its time of day untouched. Calendar
 * arithmetic on the string, never on an instant, so a daylight-saving change between the two dates
 * keeps the kickoff at its local time.
 */
export function shiftLocalDate(local: string, days: number): string {
  if (days === 0) return local;
  const [date = '', time = ''] = local.split('T');
  const shifted = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return time === '' ? shifted : `${shifted}T${time}`;
}
