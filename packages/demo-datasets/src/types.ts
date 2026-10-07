/** The two roster roles the rink-hockey discipline defines (copalibre-modules v1.1.0). */
export type DemoPlayerRole = 'goalkeeper' | 'captain';

/** A group-stage pool or a knockout cup, in the structure the source publishes. */
export type DemoPhaseKind = 'group' | 'cup';

export interface DemoOrganization {
  readonly alias: string;
  readonly name: string;
  readonly description: string;
  readonly primaryLanguage: string;
  readonly timezone: string;
}

export interface DemoClub {
  readonly alias: string;
  readonly name: string;
  readonly abbreviation: string;
  /** Path relative to the dataset directory. */
  readonly emblem: string;
}

export interface DemoTeam {
  readonly alias: string;
  readonly clubAlias: string;
  readonly name: string;
  readonly abbreviation: string;
}

/** `surname` is already pseudonymised; `givenNames` are as published. */
export interface DemoPerson {
  readonly givenNames: string;
  readonly surname: string;
}

export interface DemoPlayer extends DemoPerson {
  readonly alias: string;
  readonly teamAlias: string;
  readonly dorsal?: number;
  /** ISO 3166-1 alpha-2. */
  readonly nationality?: string;
  readonly roles: readonly DemoPlayerRole[];
  readonly goals: number;
  readonly assists: number;
}

export interface DemoPhase {
  readonly alias: string;
  readonly name: string;
  readonly kind: DemoPhaseKind;
  readonly teamAliases: readonly string[];
}

export interface DemoEvent {
  readonly period: string;
  readonly clock: string;
  readonly teamAlias: string;
  /** Kebab-case event type as observed in the game report, for example `goal`. */
  readonly type: string;
  readonly playerAlias?: string;
  readonly assistAlias?: string;
  readonly detail?: string;
}

/** A place games are played; `capacity` is how many games can run at once. */
export interface DemoVenue {
  readonly alias: string;
  readonly name: string;
}

export interface DemoGame {
  readonly key: string;
  readonly phaseAlias: string;
  /** The jornada (group) or bracket depth (cup) the game belongs to, starting at 1. */
  readonly roundNumber: number;
  /** Round label as published, for example `Jornada 2` or `Semi finales`. */
  readonly round: string;
  readonly homeTeamAlias: string;
  readonly awayTeamAlias: string;
  /** ISO 8601 local date-time without offset; the organization's timezone applies. */
  readonly scheduledAt: string;
  readonly venueAlias?: string;
  readonly homeGoals: number;
  readonly awayGoals: number;
  readonly officials: readonly DemoPerson[];
  /** False when the report lists the score but not who scored. */
  readonly scorerKnown: boolean;
  readonly events: readonly DemoEvent[];
}

export interface DemoDataset {
  readonly schemaVersion: 1;
  readonly alias: string;
  readonly name: string;
  readonly discipline: { readonly alias: string; readonly version: string };
  readonly organization: DemoOrganization;
  readonly tournament: {
    readonly alias: string;
    readonly name: string;
    readonly season: string;
    /** Path relative to the dataset directory. */
    readonly emblem: string;
  };
  readonly clubs: readonly DemoClub[];
  readonly teams: readonly DemoTeam[];
  readonly players: readonly DemoPlayer[];
  readonly phases: readonly DemoPhase[];
  readonly venues: readonly DemoVenue[];
  readonly games: readonly DemoGame[];
}

export interface DatasetIssue {
  /** File the issue is in, relative to the dataset directory. */
  readonly file: string;
  /** JSON-pointer-like path to the offending field. */
  readonly path: string;
  readonly message: string;
}
