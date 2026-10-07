import { TV_BACKGROUNDS, type TvBackground } from './tv-background.js';

export type TvLauncherView = 'dashboard' | 'standings' | 'matches' | 'overlay';

export interface TvLauncherDestination {
  readonly organization: string;
  readonly tournament: string;
  readonly view: TvLauncherView;
  readonly background: Exclude<TvBackground, 'transparent'>;
  readonly language: string;
  readonly stage?: number;
  readonly match?: number;
}

export type TvLauncherPreset = TvLauncherDestination;

export function buildTvLauncherDestination(input: TvLauncherDestination): string {
  const path =
    input.view === 'matches' && input.stage !== undefined && input.match !== undefined
      ? `/tv/${encodeURIComponent(input.organization)}/tournaments/${encodeURIComponent(input.tournament)}/stages/${input.stage}/matches/${input.match}`
      : `/tv/${encodeURIComponent(input.organization)}/tournaments/${encodeURIComponent(input.tournament)}`;
  const params = new URLSearchParams({
    lang: input.language,
    bg: input.background,
    ...(input.view === 'overlay' ? { mode: 'overlay' } : {}),
    ...(input.view === 'standings' ? { view: 'standings' } : {}),
  });
  return `${path}?${params.toString()}`;
}

const VIEWS: readonly TvLauncherView[] = ['dashboard', 'standings', 'matches', 'overlay'];

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
  if (
    preset.view === 'matches' &&
    (!Number.isSafeInteger(stage) || stage < 1 || !Number.isSafeInteger(match) || match < 1)
  ) {
    return undefined;
  }

  return {
    organization: preset.organization,
    tournament: preset.tournament,
    view: preset.view as TvLauncherView,
    background: preset.background as Exclude<TvBackground, 'transparent'>,
    language: preset.language,
    ...(preset.view === 'matches' ? { stage, match } : {}),
  };
}
