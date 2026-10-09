import { TV_BACKGROUNDS, type TvBackground } from './tv-background.js';

/**
 * `matches` is the paged match list of the kiosk (`?view=matches`); `match` pins one match; the
 * `overlay` is a broadcast scene that shows one match, pinned or, left unpinned, the live one.
 */
export type TvLauncherView = 'dashboard' | 'standings' | 'matches' | 'match' | 'overlay';

export interface TvLauncherDestination {
  readonly organization: string;
  readonly tournament: string;
  readonly view: TvLauncherView;
  readonly background: Exclude<TvBackground, 'transparent'>;
  readonly language: string;
  /** With `match`, the match's stage; the pair is how the public match route names a match. */
  readonly stage?: number;
  /** The match's ordinal within its stage. */
  readonly match?: number;
}

export type TvLauncherPreset = TvLauncherDestination;

/** Whether a view shows one match, and so asks which. */
export function viewShowsMatch(view: string): boolean {
  return view === 'match' || view === 'overlay';
}

const isOrdinal = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

export function buildTvLauncherDestination(input: TvLauncherDestination): string {
  const root = `/tv/${encodeURIComponent(input.organization)}/tournaments/${encodeURIComponent(input.tournament)}`;
  const pinned =
    viewShowsMatch(input.view) && isOrdinal(input.stage) && isOrdinal(input.match)
      ? `${root}/stages/${input.stage}/matches/${input.match}`
      : undefined;
  const params = new URLSearchParams({
    lang: input.language,
    bg: input.background,
    ...(input.view === 'overlay' ? { mode: 'overlay' } : {}),
    ...(input.view === 'standings' ? { view: 'standings' } : {}),
    ...(input.view === 'matches' ? { view: 'matches' } : {}),
  });
  return `${pinned ?? root}?${params.toString()}`;
}

const VIEWS: readonly TvLauncherView[] = ['dashboard', 'standings', 'matches', 'match', 'overlay'];

export function parseTvLauncherPreset(value: unknown): TvLauncherPreset | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const preset = value as Record<string, unknown>;
  if (
    typeof preset.organization !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(preset.organization) ||
    typeof preset.tournament !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(preset.tournament) ||
    typeof preset.view !== 'string' ||
    !VIEWS.includes(preset.view as TvLauncherView) ||
    typeof preset.background !== 'string' ||
    !TV_BACKGROUNDS.includes(preset.background as TvBackground) ||
    preset.background === 'transparent' ||
    typeof preset.language !== 'string' ||
    !['en', 'es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'].includes(preset.language)
  ) {
    return undefined;
  }

  const stage = Number(preset.stage);
  const match = Number(preset.match);
  const named = isOrdinal(stage) && isOrdinal(match);
  // A preset saved before the match list existed called the pinned match `matches`.
  const view: TvLauncherView =
    preset.view === 'matches' && named ? 'match' : (preset.view as TvLauncherView);
  if (view === 'match' && !named) return undefined;
  if (preset.view === 'overlay' && preset.stage !== undefined && !named && Number(preset.match) > 0)
    return undefined;

  return {
    organization: preset.organization,
    tournament: preset.tournament,
    view,
    background: preset.background as Exclude<TvBackground, 'transparent'>,
    language: preset.language,
    ...(viewShowsMatch(view) && named ? { stage, match } : {}),
  };
}

/** One match the launcher offers, with where it belongs and the words that name it. */
export interface TvLauncherMatchChoice {
  readonly stage: number;
  readonly stageName: string;
  /** The match's ordinal within its stage: its stable identifier. */
  readonly match: number;
  readonly round?: number;
  readonly zone?: string;
  readonly group?: string;
  readonly home: string;
  readonly away: string;
}

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

/** A group of match options under one heading (a zone or group of the stage), in the API's order. */
export interface TvLauncherMatchGroup {
  readonly heading: string;
  readonly options: readonly { readonly match: number; readonly label: string }[];
}

/**
 * The matches of one stage grouped by zone and group, each entry reading `R2 · Home — Away · #34`:
 * the round, the entrants' names and the identifier the launch link carries. `roundLabel` is the
 * round's word in the launcher's language.
 */
export function matchOptionGroups(
  choices: readonly TvLauncherMatchChoice[],
  stage: number,
  roundLabel: string,
): readonly TvLauncherMatchGroup[] {
  const groups = new Map<string, { match: number; label: string }[]>();
  for (const choice of choices) {
    if (choice.stage !== stage) continue;
    const heading = [choice.zone, choice.group].filter((part) => part !== undefined).join(' · ');
    const options = groups.get(heading) ?? [];
    options.push({
      match: choice.match,
      label: `${choice.round === undefined ? '' : `${roundLabel} ${choice.round} · `}${choice.home} — ${choice.away} · #${choice.match}`,
    });
    groups.set(heading, options);
  }
  return [...groups.entries()].map(([heading, options]) => ({ heading, options }));
}
