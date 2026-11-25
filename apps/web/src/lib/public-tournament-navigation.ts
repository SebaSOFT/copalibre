import { selectStageLayout } from './bracket.js';

export type PublicTournamentSection =
  'overview' | 'matches' | 'live' | 'standings' | 'brackets' | 'teams';

/** The stage facts the tab destinations depend on: its format and its declared zones' formats. */
export interface PublicTournamentStageFacts {
  readonly stageNumber: number;
  readonly format?: string | undefined;
  readonly zones?: readonly { readonly format?: string | undefined }[] | undefined;
}

/**
 * A stage is drawn as a bracket when the stage page draws one: a zone whose format (or, lacking
 * one, the stage's) is an elimination format. A stage with no zones takes its own format.
 * This mirrors `resolveZoneLayouts`, which the stage page uses.
 */
export function stageDrawsBracket(stage: PublicTournamentStageFacts): boolean {
  const zones = stage.zones ?? [];
  if (zones.length === 0) return selectStageLayout(stage.format) === 'bracket';
  return zones.some((zone) => selectStageLayout(zone.format ?? stage.format) === 'bracket');
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

  const stageFacts = stages.find((stage) => stage.stageNumber === routeStage);
  const firstBracketStage = stages.find(stageDrawsBracket);
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

  // A route with no known stage facts is not a bracket. The current section is only ever one
  // whose tab is rendered: a non-bracket stage marks Posiciones when it exists, else Partidos.
  const bracketTabShown = destinations.brackets !== undefined;
  const onBracket = bracketTabShown && stageFacts !== undefined && stageDrawsBracket(stageFacts);

  let current: PublicTournamentSection = 'overview';
  if (route[0] === 'matches') current = 'matches';
  else if (route[0] === 'live') current = 'live';
  else if (route[0] === 'stages') {
    if (onBracket) current = 'brackets';
    else if (route[2] !== 'matches' && destinations.standings !== undefined) current = 'standings';
    else current = 'matches';
  } else if (route[0] === 'clubs' || route[0] === 'players') current = 'teams';
  else if (
    route.length === 0 &&
    destinations.standings !== undefined &&
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
