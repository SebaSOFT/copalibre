/**
 * Reading a control-panel path back into what screen it names.
 *
 * The reverse of a responsibility this package already owns: `controlPath()`
 * builds a generic mirror of the public path, but the eight screens the
 * control panel actually serves have their own, different shape (recorded
 * here exactly as the `.astro` files they replace declared them). A
 * hand-rolled matcher for eight fixed shapes, not a routing library — the
 * same reasoning `paths.ts` gives for hand-rolling the URL contract at all.
 */

export type ControlRoute =
  | { readonly screen: 'callback' }
  | { readonly screen: 'login' }
  | { readonly screen: 'forgot-password' }
  | { readonly screen: 'reset-password' }
  | { readonly screen: 'platformAdministration' }
  | { readonly screen: 'dashboard'; readonly organizationAlias: string }
  | { readonly screen: 'roles'; readonly organizationAlias: string }
  | { readonly screen: 'auditTrail'; readonly organizationAlias: string }
  | { readonly screen: 'preferences'; readonly organizationAlias: string }
  | { readonly screen: 'newTournament'; readonly organizationAlias: string }
  | { readonly screen: 'clubs'; readonly organizationAlias: string }
  | { readonly screen: 'resources'; readonly organizationAlias: string }
  | {
      readonly screen: 'personProfile';
      readonly organizationAlias: string;
      readonly personId: string;
    }
  | {
      readonly screen: 'registrations';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
    }
  | {
      /** Tournament settings: name/region/capacity/checkInClosesAt edit and preview. */
      readonly screen: 'tournamentSettings';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
    }
  | {
      /** A published tournament's ruleset override fields: edit and preview (openspec 0169). */
      readonly screen: 'tournamentRuleset';
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
      /**
       * The bulk/structured entry screen: a sibling of `matchConsole`
       * for a match played with no live console present, at `.../matches/
       * {matchId}/load` — one segment deeper than the console's own URL, not
       * a separate top-level screen, since both operate on the same match.
       */
      readonly screen: 'loadMatchData';
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
    }
  | {
      /** Zone/Group management and entrant assignment. */
      readonly screen: 'zoneGroups';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly stageNumber: number;
    }
  | {
      /** A zone's promotion-plan configuration and review. */
      readonly screen: 'promotionPlan';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly stageNumber: number;
      readonly zoneNumber: number;
    }
  | {
      /** The schedule builder: calendar + list, manual assignment. */
      readonly screen: 'schedule';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
      readonly stageNumber: number;
    }
  | {
      /**
       * The matches view (openspec 0172): a flat, filterable card list of
       * the tournament's matches, `org.view-internal-standings`-gated.
       * Tournament-scoped, not stage-scoped — a stage/group/state filter is
       * a query parameter on this same screen, not a distinct route.
       */
      readonly screen: 'matchesView';
      readonly organizationAlias: string;
      readonly tournamentAlias: string;
    };

/** Matches a control-panel pathname against the nine real screen shapes. */
export function parseControlPath(pathname: string): ControlRoute | undefined {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments[0] !== 'control') return undefined;
  const [, organizationAlias, ...rest] = segments;
  if (organizationAlias === undefined) return undefined;

  // Checked first: `/control/callback`, the OIDC redirect target, is
  // the same two-segment shape as `/control/{organization}` — without this,
  // `callback` would parse as an organization alias for the dashboard.
  // Reserved: no real organization may use this alias.
  if (organizationAlias === 'callback' && rest.length === 0) return { screen: 'callback' };
  if (organizationAlias === 'login' && rest.length === 0) return { screen: 'login' };
  if (organizationAlias === 'forgot-password' && rest.length === 0)
    return { screen: 'forgot-password' };
  if (organizationAlias === 'reset-password' && rest.length === 0)
    return { screen: 'reset-password' };
  if (organizationAlias === 'platform' && rest.length === 0)
    return { screen: 'platformAdministration' };

  if (rest.length === 0) return { screen: 'dashboard', organizationAlias };
  if (rest.length === 1 && rest[0] === 'roles') return { screen: 'roles', organizationAlias };
  if (rest.length === 1 && rest[0] === 'audit-trail')
    return { screen: 'auditTrail', organizationAlias };
  if (rest.length === 1 && rest[0] === 'preferences')
    return { screen: 'preferences', organizationAlias };
  if (rest.length === 1 && rest[0] === 'clubs') return { screen: 'clubs', organizationAlias };
  if (rest.length === 1 && rest[0] === 'resources')
    return { screen: 'resources', organizationAlias };
  if (rest.length === 2 && rest[0] === 'persons') {
    const personId = rest[1];
    if (personId === undefined) return undefined;
    return { screen: 'personProfile', organizationAlias, personId };
  }

  if (rest[0] !== 'tournaments') return undefined;
  if (rest.length === 2 && rest[1] === 'new') {
    return { screen: 'newTournament', organizationAlias };
  }

  const tournamentAlias = rest[1];
  if (tournamentAlias === undefined) return undefined;

  if (rest.length === 3 && rest[2] === 'registrations') {
    return { screen: 'registrations', organizationAlias, tournamentAlias };
  }
  if (rest.length === 3 && rest[2] === 'settings') {
    return { screen: 'tournamentSettings', organizationAlias, tournamentAlias };
  }
  if (rest.length === 3 && rest[2] === 'ruleset') {
    return { screen: 'tournamentRuleset', organizationAlias, tournamentAlias };
  }
  if (rest.length === 3 && rest[2] === 'reports') {
    return { screen: 'reports', organizationAlias, tournamentAlias };
  }
  if (rest.length === 3 && rest[2] === 'matches-view') {
    return { screen: 'matchesView', organizationAlias, tournamentAlias };
  }
  if (rest.length === 4 && rest[2] === 'matches') {
    const matchId = rest[3];
    if (matchId === undefined) return undefined;
    return { screen: 'matchConsole', organizationAlias, tournamentAlias, matchId };
  }
  if (rest.length === 5 && rest[2] === 'matches' && rest[4] === 'load') {
    const matchId = rest[3];
    if (matchId === undefined) return undefined;
    return { screen: 'loadMatchData', organizationAlias, tournamentAlias, matchId };
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
    if (rest[4] === 'zones') {
      return { screen: 'zoneGroups', organizationAlias, tournamentAlias, stageNumber };
    }
    if (rest[4] === 'schedule') {
      return { screen: 'schedule', organizationAlias, tournamentAlias, stageNumber };
    }
  }
  if (rest.length === 7 && rest[2] === 'stages' && rest[4] === 'zones' && rest[6] === 'promotion') {
    const stageNumber = Number(rest[3]);
    const zoneNumber = Number(rest[5]);
    if (!Number.isFinite(stageNumber) || !Number.isFinite(zoneNumber)) return undefined;
    return { screen: 'promotionPlan', organizationAlias, tournamentAlias, stageNumber, zoneNumber };
  }

  return undefined;
}
