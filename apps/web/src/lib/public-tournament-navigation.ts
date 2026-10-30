export type PublicTournamentSection = 'overview' | 'matches' | 'standings' | 'brackets' | 'teams';

export interface PublicTournamentNavigation {
  readonly tournamentPath: string;
  readonly stageNumber: number;
  readonly current: PublicTournamentSection;
}

/** Resolve section links for a tournament route without depending on client JavaScript. */
export function publicTournamentNavigation(
  pathname: string,
  search: string,
): PublicTournamentNavigation | undefined {
  const segments = pathname.split('/').filter(Boolean);
  const tournamentSegment = segments.indexOf('tournaments');
  const tournamentAlias = segments[tournamentSegment + 1];
  if (tournamentSegment < 0 || tournamentAlias === undefined) return undefined;

  const tournamentPath = '/' + segments.slice(0, tournamentSegment + 2).join('/');
  const route = segments.slice(tournamentSegment + 2);
  const queryStage = Number(new URLSearchParams(search).get('stageNumber'));
  const routeStage = route[0] === 'stages' ? Number(route[1]) : Number.NaN;
  const stageNumber =
    Number.isSafeInteger(routeStage) && routeStage > 0
      ? routeStage
      : Number.isSafeInteger(queryStage) && queryStage > 0
        ? queryStage
        : 1;

  let current: PublicTournamentSection = 'overview';
  if (route[0] === 'matches' || route[0] === 'live') current = 'matches';
  else if (route[0] === 'stages') current = route[2] === 'matches' ? 'matches' : 'brackets';
  else if (route[0] === 'players') current = 'teams';

  return { tournamentPath, stageNumber, current };
}
