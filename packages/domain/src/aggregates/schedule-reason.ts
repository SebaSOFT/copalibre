/**
 * The preset reasons for changing a published placement. A preset is stored with its code and
 * the text it rendered in the organizer's language, so every later surface (an email, a public
 * notice) can render it again in its reader's language; a typed reason has no code.
 */
export const SCHEDULE_REASON_PRESETS = [
  'venue-unavailable',
  'weather',
  'entrant-request',
  'officials-unavailable',
  'prior-match-overran',
  'broadcast',
  'data-correction',
  'other',
] as const;

export type ScheduleReasonPreset = (typeof SCHEDULE_REASON_PRESETS)[number];

export function isScheduleReasonPreset(code: string): code is ScheduleReasonPreset {
  return (SCHEDULE_REASON_PRESETS as readonly string[]).includes(code);
}
