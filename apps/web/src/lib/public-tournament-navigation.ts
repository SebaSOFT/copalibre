import { selectStageLayout } from './bracket.js';

export type PublicTournamentSection =
  'overview' | 'matches' | 'live' | 'standings' | 'brackets' | 'teams';

/** The stage facts the tab destinations depend on. */
export interface PublicTournamentStageFacts {
  readonly stageNumber: number;
  readonly format?: string | undefined;
}

export interface PublicTournamentNavigationInput {
  readonly pathname: string;
  readonly search: string;
  /** Every published stage of the tournament, in stage order. */
  readonly stages?: readonly PublicTournamentStageFacts[] | undefined;
  /** The layout code the standings view opens with; undefined when the discipline declares none. */
  readonly standingsLayoutCode?: string | undefined;
}

/** Destinations of the sections this module owns. The teams section is resolved by the header. */
export interface PublicTournamentSectionDestinations {
  readonly overview: string;
  readonly matches: string;
  readonly live: string;
  readonly standings?: string | undefined;
  readonly brackets?: string | undefined;
}

export interface PublicTournamentNavigation {
  readonly tournamentPath: string;
  readonly stageNumber: number;
  readonly current: PublicTournamentSection;
  readonly destinations: PublicTournamentSectionDestinations;
}

/** Resolve section links for a tournament route without depending on client JavaScript. */
export function publicTournamentNavigation({
  pathname,
  search,
  stages = [],
  standingsLayoutCode,
}: PublicTournamentNavigationInput): PublicTournamentNavigation | undefined {
  const segments = pathname.split('/').filter(Boolean);
  const tournamentSegment = segments.indexOf('tournaments');
  const tournamentAlias = segments[tournamentSegment + 1];
  if (tournamentSegment < 0 || tournamentAlias === undefined) return undefined;

  const tournamentPath = '/' + segments.slice(0, tournamentSegment + 2).join('/');
  const route = segments.slice(tournamentSegment + 2);
  const params = new URLSearchParams(search);
  const queryStage = Number(params.get('stageNumber'));
  const routeStage = route[0] === 'stages' ? Number(route[1]) : Number.NaN;
  const stageNumber =
    Number.isSafeInteger(routeStage) && routeStage > 0
      ? routeStage
      : Number.isSafeInteger(queryStage) && queryStage > 0
        ? queryStage
        : 1;

  const drawsBracket = (stage: PublicTournamentStageFacts | undefined): boolean =>
    selectStageLayout(stage?.format) === 'bracket';
  const stageFacts = stages.find((stage) => stage.stageNumber === routeStage);
  const firstBracketStage = stages.find(drawsBracket);
  const standingsDestination =
    standingsLayoutCode === undefined
      ? undefined
      : `${tournamentPath}?tab=${encodeURIComponent(standingsLayoutCode)}`;

  const destinations: PublicTournamentSectionDestinations = {
    overview: tournamentPath,
    matches: `${tournamentPath}/matches`,
    live: `${tournamentPath}/live`,
    standings: standingsDestination,
    brackets:
      firstBracketStage === undefined
        ? undefined
        : `${tournamentPath}/stages/${firstBracketStage.stageNumber}`,
  };

  let current: PublicTournamentSection = 'overview';
  if (route[0] === 'matches') current = 'matches';
  else if (route[0] === 'live') current = 'live';
  else if (route[0] === 'stages') {
    const onBracket = drawsBracket(stageFacts);
    if (route[2] === 'matches') current = onBracket ? 'brackets' : 'matches';
    else current = onBracket ? 'brackets' : 'standings';
  } else if (route[0] === 'clubs' || route[0] === 'players') current = 'teams';
  else if (
    route.length === 0 &&
    standingsLayoutCode !== undefined &&
    params.get('tab') === standingsLayoutCode
  )
    current = 'standings';

  return { tournamentPath, stageNumber, current, destinations };
}

/** The layout the standings view opens with: the group-phase table when declared, else the first one. */
export function defaultStandingsLayoutCode(
  layouts: readonly { readonly code: string; readonly target: string }[],
): string | undefined {
  return (layouts.find((one) => one.target === 'group-phase') ?? layouts[0])?.code;
}
