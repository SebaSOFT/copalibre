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
  | { readonly screen: 'root' }
  | { readonly screen: 'callback' }
  | { readonly screen: 'login' }
  | { readonly screen: 'forgot-password' }
  | { readonly screen: 'reset-password' }
  | { readonly screen: 'platformAdministration' }
  | { readonly screen: 'dashboard'; readonly organizationAlias: string }
  | { readonly screen: 'tournaments'; readonly organizationAlias: string }
  | { readonly screen: 'liveConsole'; readonly organizationAlias: string }
  | { readonly screen: 'organization'; readonly organizationAlias: string }
  | { readonly screen: 'analytics'; readonly organizationAlias: string }
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

/**
 * The reserved-alias and simple org-scoped shapes — every route this module
 * recognizes before it requires `rest[0] === 'tournaments'`. Order matters:
 * evaluated top to bottom, first match wins, exactly like the if-chain this
 * table replaced (openspec 0229). Each `matches`/`build` pair is its own
 * function, so its internal checks don't add to `parseControlPath`'s own
 * branch count — the table only walks a list and calls one.
 */
const ORG_SCOPED_ROUTES: readonly {
  readonly matches: (organizationAlias: string, rest: readonly string[]) => boolean;
  readonly build: (organizationAlias: string, rest: readonly string[]) => ControlRoute | undefined;
}[] = [
  // Checked first: `/control/callback`, the OIDC redirect target, is
  // the same two-segment shape as `/control/{organization}` — without this,
  // `callback` would parse as an organization alias for the dashboard.
  // Reserved: no real organization may use this alias.
  {
    matches: (organizationAlias, rest) => organizationAlias === 'callback' && rest.length === 0,
    build: () => ({ screen: 'callback' }),
  },
  {
    matches: (organizationAlias, rest) => organizationAlias === 'login' && rest.length === 0,
    build: () => ({ screen: 'login' }),
  },
  {
    matches: (organizationAlias, rest) =>
      organizationAlias === 'forgot-password' && rest.length === 0,
    build: () => ({ screen: 'forgot-password' }),
  },
  {
    matches: (organizationAlias, rest) =>
      organizationAlias === 'reset-password' && rest.length === 0,
    build: () => ({ screen: 'reset-password' }),
  },
  {
    matches: (organizationAlias, rest) => organizationAlias === 'platform' && rest.length === 0,
    build: () => ({ screen: 'platformAdministration' }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 0,
    build: (organizationAlias) => ({ screen: 'dashboard', organizationAlias }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 1 && rest[0] === 'tournaments',
    build: (organizationAlias) => ({ screen: 'tournaments', organizationAlias }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 1 && rest[0] === 'live',
    build: (organizationAlias) => ({ screen: 'liveConsole', organizationAlias }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 1 && rest[0] === 'organization',
    build: (organizationAlias) => ({ screen: 'organization', organizationAlias }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 1 && rest[0] === 'analytics',
    build: (organizationAlias) => ({ screen: 'analytics', organizationAlias }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 1 && rest[0] === 'roles',
    build: (organizationAlias) => ({ screen: 'roles', organizationAlias }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 1 && rest[0] === 'audit-trail',
    build: (organizationAlias) => ({ screen: 'auditTrail', organizationAlias }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 1 && rest[0] === 'preferences',
    build: (organizationAlias) => ({ screen: 'preferences', organizationAlias }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 1 && rest[0] === 'clubs',
    build: (organizationAlias) => ({ screen: 'clubs', organizationAlias }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 1 && rest[0] === 'resources',
    build: (organizationAlias) => ({ screen: 'resources', organizationAlias }),
  },
  {
    matches: (_organizationAlias, rest) => rest.length === 2 && rest[0] === 'persons',
    build: (organizationAlias, rest) => {
      const personId = rest[1];
      if (personId === undefined) return undefined;
      return { screen: 'personProfile', organizationAlias, personId };
    },
  },
];

/** The screen each `/stages/{n}/{suffix}` suffix names. */
const STAGE_SUFFIX_SCREENS: Readonly<
  Record<string, 'seeding' | 'standings' | 'zoneGroups' | 'schedule'>
> = {
  seeding: 'seeding',
  standings: 'standings',
  zones: 'zoneGroups',
  schedule: 'schedule',
};

/**
 * Every route nested under `/control/{org}/tournaments/{tournamentAlias}/...`
 * — evaluated only once that prefix is confirmed and `tournamentAlias` is
 * resolved. Same order-matters, first-match-wins shape as `ORG_SCOPED_ROUTES`.
 */
const TOURNAMENT_SCOPED_ROUTES: readonly {
  readonly matches: (rest: readonly string[]) => boolean;
  readonly build: (
    organizationAlias: string,
    tournamentAlias: string,
    rest: readonly string[],
  ) => ControlRoute | undefined;
}[] = [
  {
    matches: (rest) => rest.length === 3 && rest[2] === 'registrations',
    build: (organizationAlias, tournamentAlias) => ({
      screen: 'registrations',
      organizationAlias,
      tournamentAlias,
    }),
  },
  {
    matches: (rest) => rest.length === 3 && rest[2] === 'settings',
    build: (organizationAlias, tournamentAlias) => ({
      screen: 'tournamentSettings',
      organizationAlias,
      tournamentAlias,
    }),
  },
  {
    matches: (rest) => rest.length === 3 && rest[2] === 'ruleset',
    build: (organizationAlias, tournamentAlias) => ({
      screen: 'tournamentRuleset',
      organizationAlias,
      tournamentAlias,
    }),
  },
  {
    matches: (rest) => rest.length === 3 && rest[2] === 'reports',
    build: (organizationAlias, tournamentAlias) => ({
      screen: 'reports',
      organizationAlias,
      tournamentAlias,
    }),
  },
  {
    matches: (rest) => rest.length === 3 && rest[2] === 'matches-view',
    build: (organizationAlias, tournamentAlias) => ({
      screen: 'matchesView',
      organizationAlias,
      tournamentAlias,
    }),
  },
  {
    matches: (rest) => rest.length === 4 && rest[2] === 'matches',
    build: (organizationAlias, tournamentAlias, rest) => {
      const matchId = rest[3];
      if (matchId === undefined) return undefined;
      return { screen: 'matchConsole', organizationAlias, tournamentAlias, matchId };
    },
  },
  {
    matches: (rest) => rest.length === 5 && rest[2] === 'matches' && rest[4] === 'load',
    build: (organizationAlias, tournamentAlias, rest) => {
      const matchId = rest[3];
      if (matchId === undefined) return undefined;
      return { screen: 'loadMatchData', organizationAlias, tournamentAlias, matchId };
    },
  },
  {
    // One shared finiteness check for all four stage-scoped suffixes, same as
    // the if-chain this replaced — fanning this into four separate entries
    // would have quadrupled an untested defensive branch for no behavior
    // change.
    matches: (rest) => rest.length === 5 && rest[2] === 'stages',
    build: (organizationAlias, tournamentAlias, rest) => {
      const stageNumber = Number(rest[3]);
      if (!Number.isFinite(stageNumber)) return undefined;
      const screen = STAGE_SUFFIX_SCREENS[rest[4] ?? ''];
      if (screen === undefined) return undefined;
      return { screen, organizationAlias, tournamentAlias, stageNumber };
    },
  },
  {
    matches: (rest) =>
      rest.length === 7 && rest[2] === 'stages' && rest[4] === 'zones' && rest[6] === 'promotion',
    build: (organizationAlias, tournamentAlias, rest) => {
      const stageNumber = Number(rest[3]);
      const zoneNumber = Number(rest[5]);
      if (!Number.isFinite(stageNumber) || !Number.isFinite(zoneNumber)) return undefined;
      return {
        screen: 'promotionPlan',
        organizationAlias,
        tournamentAlias,
        stageNumber,
        zoneNumber,
      };
    },
  },
];

/** Matches a control-panel pathname against the nine real screen shapes. */
export function parseControlPath(pathname: string): ControlRoute | undefined {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments[0] !== 'control') return undefined;
  if (segments.length === 1) return { screen: 'root' };
  const [, organizationAlias, ...rest] = segments;
  if (organizationAlias === undefined) return undefined;

  const orgScoped = ORG_SCOPED_ROUTES.find((route) => route.matches(organizationAlias, rest));
  if (orgScoped) return orgScoped.build(organizationAlias, rest);

  if (rest[0] !== 'tournaments') return undefined;
  if (rest.length === 2 && rest[1] === 'new') {
    return { screen: 'newTournament', organizationAlias };
  }

  const tournamentAlias = rest[1];
  if (tournamentAlias === undefined) return undefined;

  const tournamentScoped = TOURNAMENT_SCOPED_ROUTES.find((route) => route.matches(rest));
  if (!tournamentScoped) return undefined;
  return tournamentScoped.build(organizationAlias, tournamentAlias, rest);
}
