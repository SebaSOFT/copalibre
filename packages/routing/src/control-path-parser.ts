/**
 * Reading a control-panel path back into what screen it names (0061).
 *
 * The reverse of a responsibility this package already owns: `controlPath()`
 * builds a generic mirror of the public path, but the eight screens the
 * control panel actually serves have their own, different shape (recorded
 * here exactly as the `.astro` files they replace declared them). A
 * hand-rolled matcher for eight fixed shapes, not a routing library — the
 * same reasoning `paths.ts` gives for hand-rolling the URL contract at all.
 */

export type ControlRoute =
  | { readonly screen: 'dashboard'; readonly organizationAlias: string }
  | { readonly screen: 'roles'; readonly organizationAlias: string }
  | { readonly screen: 'newTournament'; readonly organizationAlias: string }
  | {
      readonly screen: 'registrations';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
    }
  | {
      readonly screen: 'reports';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
    }
  | {
      readonly screen: 'matchConsole';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly matchId: string;
    }
  | {
      readonly screen: 'seeding';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly stageNumber: number;
    }
  | {
      readonly screen: 'standings';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly stageNumber: number;
    };

/** Matches a control-panel pathname against the eight real screen shapes. */
export function parseControlPath(pathname: string): ControlRoute | undefined {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments[0] !== 'control') return undefined;
  const [, organizationAlias, ...rest] = segments;
  if (organizationAlias === undefined) return undefined;

  if (rest.length === 0) return { screen: 'dashboard', organizationAlias };
  if (rest.length === 1 && rest[0] === 'roles') return { screen: 'roles', organizationAlias };

  if (rest[0] !== 'tournaments') return undefined;
  if (rest.length === 2 && rest[1] === 'new') {
    return { screen: 'newTournament', organizationAlias };
  }

  const tournamentAlias = rest[1];
  if (tournamentAlias === undefined) return undefined;

  if (rest.length === 3 && rest[2] === 'registrations') {
    return { screen: 'registrations', organizationAlias, tournamentAlias };
  }
  if (rest.length === 3 && rest[2] === 'reports') {
    return { screen: 'reports', organizationAlias, tournamentAlias };
  }
  if (rest.length === 4 && rest[2] === 'matches') {
    const matchId = rest[3];
    if (matchId === undefined) return undefined;
    return { screen: 'matchConsole', organizationAlias, tournamentAlias, matchId };
  }
  if (rest.length === 5 && rest[2] === 'stages') {
    const stageNumber = Number(rest[3]);
    if (!Number.isFinite(stageNumber)) return undefined;
    if (rest[4] === 'seeding') {
      return { screen: 'seeding', organizationAlias, tournamentAlias, stageNumber };
    }
    if (rest[4] === 'standings') {
      return { screen: 'standings', organizationAlias, tournamentAlias, stageNumber };
    }
  }

  return undefined;
}
