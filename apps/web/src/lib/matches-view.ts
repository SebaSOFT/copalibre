import type { ResultState } from './result-state.js';
import type { PublicSeriesState } from './series.js';

/**
 * The matches view's own card shape — deliberately not `BracketMatch`: this
 * is a flat list of real matches, never a bracket graph with `winner-of`/
 * `loser-of` placeholders, and it carries fields (venue, clock, latest
 * event, zone/position) the bracket's own card never has.
 */
export interface MatchCardData {
  readonly matchId: string;
  readonly stageNumber: number;
  readonly matchNumber: number;
  readonly state: ResultState;
  readonly homeName?: string;
  readonly homeAbbreviation?: string;
  readonly homeScore?: number;
  readonly awayName?: string;
  readonly awayAbbreviation?: string;
  readonly awayScore?: number;
  readonly clockSeconds?: number;
  readonly venueName?: string;
  readonly latestEvent?: { readonly label: string; readonly occurredAt: string };
  readonly zoneName?: string;
  readonly groupName?: string;
  readonly homePosition?: number;
  readonly awayPosition?: number;
  readonly series?: PublicSeriesState;
  readonly decidingFactor?: string;
  /** Present only on the control-web response, for an authorized viewer. */
  readonly homeTrace?: readonly string[];
  readonly awayTrace?: readonly string[];
}

/** `78:46` — minutes can exceed 59, unlike a wall clock. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Fills a `{placeholder}` template with per-match values, entirely inside
 * this already-hydrated client bundle. `MatchCard` needs this instead of
 * calling a formatter function passed down from its parent page: on the
 * public site it mounts via `client:load`, and Astro serializes an
 * island's props to JSON to hand them to the client — a function survives
 * that trip as `undefined`. So `MatchCardLabels` carries the raw ICU-style
 * template string (still `{time}`, unresolved) instead of a closure, and
 * this does the same substitution `intl.formatMessage` would have, without
 * needing `react-intl` in the browser bundle at all.
 */
export function applyTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
