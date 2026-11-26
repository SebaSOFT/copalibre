import { TV_BACKGROUNDS, type TvBackground } from './tv-background.js';
import { nextTvMatches } from './tv-match-list.js';

/**
 * What the launcher can open, one entry per page it builds:
 * - `kiosk`: the rotating venue panel (the layout absent);
 * - `presentation` and `dashboardLayout`: the full-frame layouts (`layout=presentation|dashboard`);
 * - `multicourt`: the court grid, with its optional grid size;
 * - `standings` and `matches`: the kiosk's own full-frame views (`view=`);
 * - `match`: the kiosk pinned to one match;
 * - `overlay-scorebug`, `overlay-lower`, `overlay-full`: the three broadcast overlays (`mode=`).
 */
export const TV_LAUNCHER_VIEWS = [
  'kiosk',
  'presentation',
  'dashboardLayout',
  'multicourt',
  'standings',
  'matches',
  'match',
  'overlay-scorebug',
  'overlay-lower',
  'overlay-full',
] as const;
export type TvLauncherView = (typeof TV_LAUNCHER_VIEWS)[number];

export const TV_OVERLAY_VIEWS = ['overlay-scorebug', 'overlay-lower', 'overlay-full'] as const;
export type TvLauncherOverlayView = (typeof TV_OVERLAY_VIEWS)[number];

export type TvLauncherGrid = 2 | 4 | 6 | 'auto';
const GRIDS: readonly TvLauncherGrid[] = [2, 4, 6, 'auto'];

export function isOverlayView(view: string): view is TvLauncherOverlayView {
  return (TV_OVERLAY_VIEWS as readonly string[]).includes(view);
}

/** Whether a view shows one match, and so asks which: the pinned kiosk and every overlay. */
export function viewShowsMatch(view: string): boolean {
  return view === 'match' || isOverlayView(view);
}

/**
 * The background a view starts on: an overlay is composited over footage, so it starts transparent;
 * every other view is a screen and starts on the discipline ground.
 */
export function defaultBackgroundFor(view: string): TvBackground {
  return isOverlayView(view) ? 'transparent' : 'discipline';
}

export interface TvLauncherDestination {
  readonly organization: string;
  readonly tournament: string;
  readonly view: TvLauncherView;
  readonly background: TvBackground;
  readonly language: string;
  /** With `match` or an overlay, the match's stage; the pair is how the public match route names a match. */
  readonly stage?: number;
  /** The match's ordinal within its stage. */
  readonly match?: number;
  /** An overlay's court: a venue whose live match it follows. Exclusive with a pinned match. */
  readonly court?: string;
  /** The multi-court grid's size; `auto` is the layout's own choice and is not written. */
  readonly grid?: TvLauncherGrid;
}

export type TvLauncherPreset = TvLauncherDestination;

const isOrdinal = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

export function buildTvLauncherDestination(input: TvLauncherDestination): string {
  const root = `/tv/${encodeURIComponent(input.organization)}/tournaments/${encodeURIComponent(input.tournament)}`;
  const pinned =
    viewShowsMatch(input.view) && isOrdinal(input.stage) && isOrdinal(input.match)
      ? `${root}/stages/${input.stage}/matches/${input.match}`
      : undefined;
  // A court and a pinned match are alternatives: the pinned one wins, and the court is never written beside it.
  const court =
    isOverlayView(input.view) && pinned === undefined && input.court ? input.court : undefined;
  const params = new URLSearchParams({ lang: input.language, bg: input.background });
  if (isOverlayView(input.view)) params.set('mode', input.view);
  if (input.view === 'presentation') params.set('layout', 'presentation');
  if (input.view === 'dashboardLayout') params.set('layout', 'dashboard');
  if (input.view === 'multicourt') {
    params.set('layout', 'multicourt');
    if (input.grid !== undefined && input.grid !== 'auto') params.set('grid', String(input.grid));
  }
  if (input.view === 'standings' || input.view === 'matches') params.set('view', input.view);
  if (court !== undefined) params.set('court', court);
  return `${pinned ?? root}?${params.toString()}`;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'];

/** Whether a stored value is a launch destination's own fields: addresses and choices, nothing else. */
function hasValidFields(preset: Record<string, unknown>): boolean {
  const slug = (value: unknown): boolean => typeof value === 'string' && SLUG.test(value);
  const member = (value: unknown, allowed: readonly string[]): boolean =>
    typeof value === 'string' && allowed.includes(value);
  return (
    slug(preset.organization) &&
    slug(preset.tournament) &&
    member(preset.background, TV_BACKGROUNDS) &&
    member(preset.language, LANGUAGES)
  );
}

/**
 * A view as it is stored. Presets saved before the launcher named its views are read as the view they
 * meant: `dashboard` was the rotating panel, `overlay` was the corner bug, and `matches` named the pinned
 * match when it carried a stage and a match.
 */
function viewOf(stored: unknown, named: boolean): TvLauncherView | undefined {
  if (stored === 'dashboard') return 'kiosk';
  if (stored === 'overlay') return 'overlay-scorebug';
  if (stored === 'matches' && named) return 'match';
  return (TV_LAUNCHER_VIEWS as readonly string[]).includes(stored as string)
    ? (stored as TvLauncherView)
    : undefined;
}

/** An overlay's court: a venue name of a sensible length, and only where no match is pinned. */
function courtOf(preset: Record<string, unknown>, view: TvLauncherView, named: boolean) {
  const court = preset.court;
  return isOverlayView(view) &&
    !named &&
    typeof court === 'string' &&
    court.length > 0 &&
    court.length <= 120
    ? court
    : undefined;
}

export function parseTvLauncherPreset(value: unknown): TvLauncherPreset | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const preset = value as Record<string, unknown>;
  if (!hasValidFields(preset)) return undefined;

  const stage = Number(preset.stage);
  const match = Number(preset.match);
  const named = isOrdinal(stage) && isOrdinal(match);
  const view = viewOf(preset.view, named);
  if (view === undefined) return undefined;
  if (view === 'match' && !named) return undefined;
  const court = courtOf(preset, view, named);
  const grid = GRIDS.find((item) => item === preset.grid);

  return {
    organization: preset.organization as string,
    tournament: preset.tournament as string,
    view,
    background: preset.background as TvBackground,
    language: preset.language as string,
    ...(viewShowsMatch(view) && named ? { stage, match } : {}),
    ...(court === undefined ? {} : { court }),
    ...(grid === undefined ? {} : { grid }),
  };
}

/** One match the launcher offers, with where it belongs, when it is played and the words that name it. */
export interface TvLauncherMatchChoice {
  readonly stage: number;
  readonly stageName: string;
  /** The match's ordinal within its stage: its stable identifier. */
  readonly match: number;
  /** The competition and round as the matches view names them: "Copa Oro · Semifinal". */
  readonly scope?: string;
  /** The zone and the group the match belongs to, which head its options. */
  readonly zone?: string;
  readonly group?: string;
  readonly home: string;
  readonly away: string;
  /** Where it is played, when the schedule says. */
  readonly venue?: string;
  readonly state: string;
  /** The kickoff, as the schedule carries it; an unscheduled match has none. */
  readonly scheduledAt?: string;
  /** Whether the match is still upcoming fifteen minutes past its kickoff. */
  readonly delayed?: boolean;
}

/** The venues the choices are played in, once each, for an overlay that follows a court. */
export function courtOptions(choices: readonly TvLauncherMatchChoice[]): readonly string[] {
  return [
    ...new Set(choices.flatMap((choice) => (choice.venue === undefined ? [] : [choice.venue]))),
  ].sort((a, b) => a.localeCompare(b));
}

/** The value a court takes in the match select, which is otherwise a match ordinal. */
export const COURT_VALUE_PREFIX = 'court:';

/** A stage as the stage select shows it: its number and its name. */
export function stageOptionLabel(
  choice: Pick<TvLauncherMatchChoice, 'stage' | 'stageName'>,
): string {
  return choice.stageName === '' ? String(choice.stage) : `${choice.stage} · ${choice.stageName}`;
}

/** The distinct stages of a list of choices, in stage order, each with its label. */
export function stageOptions(
  choices: readonly TvLauncherMatchChoice[],
): readonly { readonly stage: number; readonly label: string }[] {
  const seen = new Map<number, string>();
  for (const choice of choices) {
    if (!seen.has(choice.stage)) seen.set(choice.stage, stageOptionLabel(choice));
  }
  return [...seen.entries()].sort(([a], [b]) => a - b).map(([stage, label]) => ({ stage, label }));
}

/**
 * The stage the launcher opens on: the stage of the live match; else the stage of the next scheduled
 * match that is not delayed (the rule the TV surfaces share); else the last stage.
 */
export function defaultStage(
  choices: readonly TvLauncherMatchChoice[],
  now: Date | number = Date.now(),
): number | undefined {
  const live = choices.find((choice) => choice.state === 'live');
  if (live) return live.stage;
  const next = nextTvMatches(choices, now, 1)[0];
  if (next) return next.stage;
  return stageOptions(choices).at(-1)?.stage;
}

/** The words an option reads with, in the launcher's language. */
export interface TvLauncherOptionText {
  /** The state's word, by state; `delayed` replaces `upcoming` for a match past its kickoff. */
  readonly state: Readonly<Record<string, string>>;
  readonly delayed: string;
  /** The kickoff, formatted in the organization's time zone and the launcher's language. */
  readonly when: (scheduledAt: string) => string;
}

/** A group of match options under one heading (a zone or group of the stage), in the API's order. */
export interface TvLauncherMatchGroup {
  readonly heading: string;
  readonly options: readonly { readonly match: number; readonly label: string }[];
}

/**
 * The matches of one stage grouped by zone and group. Each option reads
 * `{competition and round} · {home} — {away} · {day, time} · {court} · {state} · #{match}`: the parts a
 * match does not have are left out, and the match number stays last for operators who know it.
 */
export function matchOptionGroups(
  choices: readonly TvLauncherMatchChoice[],
  stage: number,
  text: TvLauncherOptionText,
): readonly TvLauncherMatchGroup[] {
  const groups = new Map<string, { match: number; label: string }[]>();
  for (const choice of choices) {
    if (choice.stage !== stage) continue;
    const heading = [choice.zone, choice.group].filter((part) => part !== undefined).join(' · ');
    const options = groups.get(heading) ?? [];
    const state = choice.delayed ? text.delayed : (text.state[choice.state] ?? choice.state);
    const parts = [
      choice.scope,
      `${choice.home} — ${choice.away}`,
      choice.scheduledAt === undefined ? undefined : text.when(choice.scheduledAt),
      choice.venue,
      state,
    ].filter((part): part is string => part !== undefined && part !== '');
    options.push({ match: choice.match, label: `${parts.join(' · ')} · #${choice.match}` });
    groups.set(heading, options);
  }
  return [...groups.entries()].map(([heading, options]) => ({ heading, options }));
}

const GRID_VALUES: readonly string[] = ['2', '4', '6', 'auto'];

/**
 * The view an address opens. The address names it in four places: `mode=` for an overlay, `layout=`
 * for the full-frame layouts, `view=` for standings and the list, and `stage` with `match` for a pinned
 * match. An address that names none of them opens the rotating kiosk. Addresses from before the
 * launcher named its views still open the view they meant.
 */
export function viewFromParams(params: URLSearchParams): TvLauncherView {
  const mode = params.get('mode');
  if (mode === 'overlay') return 'overlay-scorebug';
  if (mode !== null && isOverlayView(mode)) return mode;
  const layout = params.get('layout');
  if (layout === 'presentation') return 'presentation';
  if (layout === 'dashboard') return 'dashboardLayout';
  if (layout === 'multicourt') return 'multicourt';
  const view = params.get('view');
  if (view === 'standings') return 'standings';
  if (view === 'matches' || view === 'fixtures') {
    return params.has('stage') && params.has('match') ? 'match' : 'matches';
  }
  return 'kiosk';
}

/** The grid size an address names; anything else is the layout's own automatic choice. */
export function gridFromParams(params: URLSearchParams): TvLauncherGrid {
  const value = params.get('grid');
  if (value === null || !GRID_VALUES.includes(value) || value === 'auto') return 'auto';
  return Number(value) as TvLauncherGrid;
}

/**
 * A kickoff as an option reads it: the weekday, day, month and 24-hour time, in the organization's time
 * zone and the launcher's language. An unreadable timestamp reads as nothing rather than as a guess.
 */
export function formatKickoff(scheduledAt: string, locale: string, timeZone?: string): string {
  const at = new Date(scheduledAt);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    ...(timeZone === undefined || timeZone === '' ? {} : { timeZone }),
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}
