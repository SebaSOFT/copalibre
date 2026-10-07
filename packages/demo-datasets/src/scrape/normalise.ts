import type {
  DemoClub,
  DemoDataset,
  DemoEvent,
  DemoGame,
  DemoPerson,
  DemoPhase,
  DemoPlayer,
  DemoPlayerRole,
  DemoTeam,
  DemoVenue,
} from '../types.js';
import { createScrambler, type Scrambler } from '../scramble.js';
import type { DatasetConfig } from './config.js';
import type { RawGame } from './parse-calendar.js';
import type { RawReport, RawSheetRow } from './parse-report.js';
import type { RawPlayer } from './parse-roster.js';
import type { RawTeam } from './parse-teams.js';
import { nameKey, splitName, titleCase, toAlias, toLocalIso, type SplitName } from './text.js';

export interface NormaliseInput {
  readonly config: DatasetConfig;
  readonly teams: readonly RawTeam[];
  readonly games: readonly RawGame[];
  /** Reports by the portal's game id; a game whose report could not be fetched is absent. */
  readonly reports: ReadonlyMap<string, RawReport>;
  readonly roster: readonly RawPlayer[];
  /** Candidate replacement surnames. */
  readonly pool: readonly string[];
  /** Candidate replacement given names, for officials. */
  readonly givenNamePool: readonly string[];
}

export interface NormaliseResult {
  readonly dataset: DemoDataset;
  /** Club alias to the portal's logo file name, for the emblem download. */
  readonly clubLogos: ReadonlyMap<string, string>;
  /** Anything the source left inconsistent, for the operator to read. */
  readonly warnings: readonly string[];
}

interface PlayerDraft {
  readonly playerId: string;
  readonly teamId: string;
  readonly name: SplitName;
  readonly nationality: string | undefined;
  readonly goals: number;
  readonly assists: number;
  dorsals: number[];
  goalkeeper: boolean;
  captain: boolean;
}

const EMBLEMS_DIRECTORY = 'emblems/clubs';

/** Every real surname the source prints, for the scrambler's exclusions and the leak check. */
export function collectRealSurnames(input: Pick<NormaliseInput, 'roster' | 'reports'>): string[] {
  const surnames: string[] = [];
  for (const player of input.roster) surnames.push(splitName(player.fullName).surname);
  for (const report of input.reports.values()) {
    for (const person of report.referees) surnames.push(person.surname);
    for (const row of [...report.homeSheet, ...report.awaySheet]) surnames.push(row.name.surname);
    for (const goal of report.goals) surnames.push(goal.scorerName.surname);
  }
  return surnames;
}

/** Numeric-aware ascending order so the scrambler sees keys in a stable order. */
function byId(a: string, b: string): number {
  return Number(a) - Number(b) || a.localeCompare(b);
}

function mode(values: readonly number[]): number | undefined {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: number | undefined;
  for (const [value, count] of counts) {
    if (best === undefined || count > (counts.get(best) ?? 0)) best = value;
  }
  return best;
}

/**
 * Finds the roster player a sheet row refers to. Names are compared exactly
 * first; otherwise a unique player on the same team with the same given names
 * and a surname that starts with the other's (the portal prints
 * `ACIAR MEDIRA` on a sheet and `ACIAR` on the roster).
 */
function matchPlayer(
  drafts: ReadonlyMap<string, PlayerDraft>,
  byKey: ReadonlyMap<string, PlayerDraft>,
  teamId: string,
  name: SplitName,
): PlayerDraft | undefined {
  const exact = byKey.get(`${teamId}|${nameKey(`${name.surname},${name.givenNames}`)}`);
  if (exact) return exact;
  const given = nameKey(`x,${name.givenNames}`).split('|')[1];
  const surname = nameKey(`${name.surname},x`).split('|')[0] ?? '';
  const near = [...drafts.values()].filter((draft) => {
    if (draft.teamId !== teamId) return false;
    const draftSurname = nameKey(`${draft.name.surname},x`).split('|')[0] ?? '';
    const draftGiven = nameKey(`x,${draft.name.givenNames}`).split('|')[1];
    return (
      draftGiven === given && (surname.startsWith(draftSurname) || draftSurname.startsWith(surname))
    );
  });
  return near.length === 1 ? near[0] : undefined;
}

function givenNamesOf(name: SplitName): string {
  return titleCase(name.givenNames);
}

function roundFromLabel(label: string): number {
  const match = /(\d+)\s*$/.exec(label);
  return match ? Number(match[1]) : 1;
}

/**
 * The portal numbers cup rounds backwards from the final (final 1, quarter-finals 7), which is not
 * a round order. A cup round here is the dense rank of its earliest date within the cup: quarter-finals
 * 1, semi-finals and the 5th-to-8th games 2, the final and placement games 3.
 */
function cupRounds(games: readonly RawGame[]): ReadonlyMap<string, number> {
  const earliest = new Map<string, string>();
  for (const game of games) {
    const key = `${toAlias(game.phaseName)}|${game.round}`;
    const when = toLocalIso(game.date, game.time).slice(0, 10);
    const current = earliest.get(key);
    if (current === undefined || when < current) earliest.set(key, when);
  }
  const rounds = new Map<string, number>();
  const byPhase = new Map<string, string[]>();
  for (const [key, when] of earliest) {
    const phase = key.split('|')[0] as string;
    byPhase.set(phase, [...(byPhase.get(phase) ?? []), when]);
  }
  for (const [key, when] of earliest) {
    const phase = key.split('|')[0] as string;
    const dates = [...new Set(byPhase.get(phase))].sort();
    rounds.set(key, dates.indexOf(when) + 1);
  }
  return rounds;
}

/** Period ascending, then clock descending: the portal's clock counts down within a period. */
function chronological(a: DemoEvent, b: DemoEvent): number {
  return (
    a.period.localeCompare(b.period, 'en', { numeric: true }) ||
    b.clock.localeCompare(a.clock, 'en', { numeric: true })
  );
}

interface Squad {
  readonly clubs: readonly DemoClub[];
  readonly teams: readonly DemoTeam[];
  /** Club alias to the portal's logo file name. */
  readonly clubLogos: ReadonlyMap<string, string>;
  readonly teamAliasById: ReadonlyMap<string, string>;
  readonly teamAliasByLogo: ReadonlyMap<string, string>;
  readonly teamIdByAlias: ReadonlyMap<string, string>;
}

/** One club and one team per portal team, aliased from the title-cased name. */
function buildSquad(rawTeams: readonly RawTeam[]): Squad {
  const clubs: DemoClub[] = [];
  const teams: DemoTeam[] = [];
  const clubLogos = new Map<string, string>();
  const teamAliasById = new Map<string, string>();
  const teamAliasByLogo = new Map<string, string>();
  const usedAliases = new Set<string>();
  const byName = [...rawTeams].sort(
    (a, b) =>
      titleCase(a.name).localeCompare(titleCase(b.name)) ||
      a.abbreviation.localeCompare(b.abbreviation),
  );
  for (const raw of byName) {
    const name = titleCase(raw.name);
    let alias = toAlias(name);
    if (usedAliases.has(alias)) alias = toAlias(`${name} ${raw.abbreviation}`);
    usedAliases.add(alias);
    clubs.push({
      alias,
      name,
      abbreviation: raw.abbreviation,
      emblem: `${EMBLEMS_DIRECTORY}/${alias}.png`,
    });
    teams.push({ alias, clubAlias: alias, name, abbreviation: raw.abbreviation });
    clubLogos.set(alias, raw.logoFile);
    teamAliasById.set(raw.teamId, alias);
    teamAliasByLogo.set(raw.logoFile, alias);
  }
  const teamIdByAlias = new Map([...teamAliasById].map(([id, alias]) => [alias, id] as const));
  return { clubs, teams, clubLogos, teamAliasById, teamAliasByLogo, teamIdByAlias };
}

function newDraft(
  playerId: string,
  teamId: string,
  name: SplitName,
  extras: Partial<Pick<PlayerDraft, 'nationality' | 'goals' | 'assists'>>,
): PlayerDraft {
  return {
    playerId,
    teamId,
    name,
    nationality: extras.nationality,
    goals: extras.goals ?? 0,
    assists: extras.assists ?? 0,
    dorsals: [],
    goalkeeper: false,
    captain: false,
  };
}

/** Roster players first, then any scorer the roster lacks (taken from the goal row). */
function draftPlayers(
  input: NormaliseInput,
  squad: Squad,
  warnings: string[],
): Map<string, PlayerDraft> {
  const drafts = new Map<string, PlayerDraft>();
  for (const raw of input.roster) {
    if (!squad.teamAliasById.has(raw.teamId)) {
      warnings.push(`roster player ${raw.playerId} is on an unknown team ${raw.teamId}`);
      continue;
    }
    drafts.set(
      raw.playerId,
      newDraft(raw.playerId, raw.teamId, splitName(raw.fullName), {
        nationality: raw.nationality,
        goals: raw.goals,
        assists: raw.assists,
      }),
    );
  }
  for (const report of input.reports.values()) {
    for (const goal of report.goals) {
      if (drafts.has(goal.playerId) || !squad.teamAliasById.has(goal.teamId)) continue;
      warnings.push(`scorer ${goal.playerId} is missing from the roster; added from the goal row`);
      drafts.set(goal.playerId, newDraft(goal.playerId, goal.teamId, goal.scorerName, {}));
    }
  }
  return drafts;
}

/** Dorsal, goalkeeper and captain marks come from the match sheets, matched to the drafted players. */
function applySheets(
  input: NormaliseInput,
  squad: Squad,
  drafts: ReadonlyMap<string, PlayerDraft>,
): void {
  const byKey = new Map<string, PlayerDraft>();
  for (const draft of drafts.values()) {
    byKey.set(
      `${draft.teamId}|${nameKey(`${draft.name.surname},${draft.name.givenNames}`)}`,
      draft,
    );
  }
  for (const game of input.games) {
    const report = input.reports.get(game.gameId);
    if (!report) continue;
    const sides: [readonly RawSheetRow[], string | undefined][] = [
      [report.homeSheet, squad.teamAliasByLogo.get(game.homeLogoFile)],
      [report.awaySheet, squad.teamAliasByLogo.get(game.awayLogoFile)],
    ];
    for (const [sheet, alias] of sides) {
      const teamId = alias ? squad.teamIdByAlias.get(alias) : undefined;
      if (teamId) applySheet(drafts, byKey, teamId, sheet);
    }
  }
}

function applySheet(
  drafts: ReadonlyMap<string, PlayerDraft>,
  byKey: ReadonlyMap<string, PlayerDraft>,
  teamId: string,
  sheet: readonly RawSheetRow[],
): void {
  for (const row of sheet) {
    const draft = matchPlayer(drafts, byKey, teamId, row.name);
    if (!draft) continue;
    if (row.dorsal !== undefined) draft.dorsals.push(row.dorsal);
    draft.goalkeeper ||= row.goalkeeper;
    draft.captain ||= row.captain;
  }
}

/** A unique alias for a player: `given-surname`, then `-2`, `-3` for a repeat. */
function uniqueAlias(base: string, used: Set<string>): string {
  let alias = base;
  for (let suffix = 2; used.has(alias); suffix += 1) alias = `${base.slice(0, 60)}-${suffix}`;
  used.add(alias);
  return alias;
}

function buildPlayers(
  drafts: ReadonlyMap<string, PlayerDraft>,
  squad: Squad,
  scrambler: Scrambler,
): { players: DemoPlayer[]; playerAliasById: Map<string, string> } {
  const players: DemoPlayer[] = [];
  const playerAliasById = new Map<string, string>();
  const used = new Set<string>();
  for (const draft of [...drafts.values()].sort((a, b) => byId(a.playerId, b.playerId))) {
    const surname = scrambler.replacementFor(`player:${draft.playerId}`);
    const givenNames = givenNamesOf(draft.name) || 'Jugador';
    const alias = uniqueAlias(toAlias(`${givenNames} ${surname}`), used);
    playerAliasById.set(draft.playerId, alias);
    const dorsal = mode(draft.dorsals);
    const roles: DemoPlayerRole[] = [];
    if (draft.goalkeeper) roles.push('goalkeeper');
    if (draft.captain) roles.push('captain');
    players.push({
      alias,
      teamAlias: squad.teamAliasById.get(draft.teamId) as string,
      givenNames,
      surname,
      ...(dorsal === undefined ? {} : { dorsal }),
      ...(draft.nationality === undefined ? {} : { nationality: draft.nationality }),
      roles,
      goals: draft.goals,
      assists: draft.assists,
    });
  }
  players.sort((a, b) => a.teamAlias.localeCompare(b.teamAlias) || a.alias.localeCompare(b.alias));
  return { players, playerAliasById };
}

/**
 * Officials are wholly replaced, keyed by order of first appearance. The source prints their names
 * inconsistently (flipped order, missing commas, stray punctuation), so a real surname can sit in the
 * given-name position; both parts are replaced.
 */
function buildOfficials(
  input: NormaliseInput,
  scrambler: Scrambler,
): (person: SplitName) => DemoPerson | undefined {
  const givenNames = createScrambler({
    seed: `${input.config.scramblerSeed}/given`,
    pool: input.givenNamePool,
    realSurnames: [],
  });
  const ordinalOf = new Map<string, number>();
  for (const game of [...input.games].sort((a, b) => byId(a.gameId, b.gameId))) {
    for (const person of input.reports.get(game.gameId)?.referees ?? []) {
      const key = nameKey(`${person.surname},${person.givenNames}`);
      if (!ordinalOf.has(key)) ordinalOf.set(key, ordinalOf.size + 1);
    }
  }
  // Assign in ordinal order so replacements do not depend on game order.
  const byOrdinal = new Map<number, DemoPerson>();
  for (const ordinal of [...ordinalOf.values()].sort((a, b) => a - b)) {
    byOrdinal.set(ordinal, {
      givenNames: givenNames.replacementFor(`referee:${ordinal}`),
      surname: scrambler.replacementFor(`referee:${ordinal}`),
    });
  }
  return (person) => {
    const ordinal = ordinalOf.get(nameKey(`${person.surname},${person.givenNames}`));
    return ordinal === undefined ? undefined : byOrdinal.get(ordinal);
  };
}

function buildVenues(games: readonly RawGame[]): {
  venues: DemoVenue[];
  venueAliasByName: Map<string, string>;
} {
  const venues: DemoVenue[] = [];
  const venueAliasByName = new Map<string, string>();
  for (const name of [...new Set(games.map((game) => game.venue).filter(Boolean))].sort()) {
    const alias = toAlias(name);
    venues.push({ alias, name });
    venueAliasByName.set(name, alias);
  }
  return { venues, venueAliasByName };
}

/** Phases in order of first appearance, groups before cups, each with the teams that play in it. */
function buildPhases(games: readonly RawGame[], squad: Squad): DemoPhase[] {
  const names = new Map<string, string>();
  const teams = new Map<string, Set<string>>();
  for (const game of games) {
    const alias = toAlias(game.phaseName);
    names.set(alias, game.phaseName);
    const members = teams.get(alias) ?? new Set<string>();
    for (const logo of [game.homeLogoFile, game.awayLogoFile]) {
      const team = squad.teamAliasByLogo.get(logo);
      if (team) members.add(team);
    }
    teams.set(alias, members);
  }
  const phases: DemoPhase[] = [...names].map(([alias, name]) => ({
    alias,
    name,
    kind: /^copa/i.test(name) ? ('cup' as const) : ('group' as const),
    teamAliases: [...(teams.get(alias) ?? [])].sort(),
  }));
  return phases.sort((a, b) =>
    a.kind === b.kind ? a.alias.localeCompare(b.alias) : a.kind === 'group' ? -1 : 1,
  );
}

interface GameContext {
  readonly squad: Squad;
  readonly playerAliasById: ReadonlyMap<string, string>;
  readonly venueAliasByName: ReadonlyMap<string, string>;
  readonly cupRound: ReadonlyMap<string, number>;
  readonly official: (person: SplitName) => DemoPerson | undefined;
  readonly reports: ReadonlyMap<string, RawReport>;
  readonly warnings: string[];
}

/** The report's goals as events, kept only when they add up to the official score. */
function goalEvents(
  raw: RawGame,
  report: RawReport | undefined,
  home: string,
  away: string,
  context: GameContext,
): { events: DemoEvent[]; scorerKnown: boolean } {
  if (!report) {
    context.warnings.push(`game ${raw.gameId}: no report; score kept, no scorers`);
    return { events: [], scorerKnown: false };
  }
  const candidate: DemoEvent[] = [];
  for (const goal of report.goals) {
    const teamAlias = context.squad.teamAliasById.get(goal.teamId);
    const playerAlias = context.playerAliasById.get(goal.playerId);
    if (!teamAlias || !playerAlias) continue;
    candidate.push({
      period: goal.period,
      clock: goal.clock,
      teamAlias,
      type: 'goal',
      playerAlias,
      ...(goal.detail ? { detail: goal.detail } : {}),
    });
  }
  const count = (alias: string): number =>
    candidate.filter((event) => event.teamAlias === alias).length;
  if (count(home) === raw.homeGoals && count(away) === raw.awayGoals) {
    return { events: candidate.sort(chronological), scorerKnown: true };
  }
  const note = raw.note ? ` (${raw.note})` : '';
  context.warnings.push(
    `game ${raw.gameId}: ${candidate.length} goal events do not match the official ${raw.homeGoals}-${raw.awayGoals}${note}; scorers dropped`,
  );
  return { events: [], scorerKnown: false };
}

/** The same person can be printed twice on one sheet (once per role); an official is listed once. */
function officialsOf(report: RawReport | undefined, context: GameContext): DemoPerson[] {
  const seen = new Set<string>();
  const officials: DemoPerson[] = [];
  for (const referee of report?.referees ?? []) {
    const person = context.official(referee);
    if (person === undefined) continue;
    const key = `${person.givenNames} ${person.surname}`;
    if (seen.has(key)) continue;
    seen.add(key);
    officials.push(person);
  }
  return officials;
}

function buildGame(raw: RawGame, context: GameContext): DemoGame {
  const home = context.squad.teamAliasByLogo.get(raw.homeLogoFile);
  const away = context.squad.teamAliasByLogo.get(raw.awayLogoFile);
  if (!home || !away) throw new Error(`game ${raw.gameId} has a team missing from the team list`);
  if (raw.homeGoals === undefined || raw.awayGoals === undefined) {
    throw new Error(`game ${raw.gameId} has no score`);
  }
  const report = context.reports.get(raw.gameId);
  const { events, scorerKnown } = goalEvents(raw, report, home, away, context);
  const venueAlias = context.venueAliasByName.get(raw.venue);
  const phaseAlias = toAlias(raw.phaseName);
  return {
    key: `game-${raw.gameId}`,
    phaseAlias,
    roundNumber: context.cupRound.get(`${phaseAlias}|${raw.round}`) ?? roundFromLabel(raw.round),
    round: raw.round,
    homeTeamAlias: home,
    awayTeamAlias: away,
    scheduledAt: toLocalIso(raw.date, raw.time),
    ...(venueAlias === undefined ? {} : { venueAlias }),
    homeGoals: raw.homeGoals,
    awayGoals: raw.awayGoals,
    officials: officialsOf(report, context),
    scorerKnown,
    events,
  };
}

/**
 * Turns the parsed portal pages into a dataset. Every person's surname is
 * replaced here, before any alias, name or emblem path is derived, so a real
 * surname never reaches the output. The portal's player ids are used only to
 * join sources and are dropped.
 */
export function normalise(input: NormaliseInput): NormaliseResult {
  const { config } = input;
  const warnings: string[] = [];
  const squad = buildSquad(input.teams);
  const scrambler = createScrambler({
    seed: config.scramblerSeed,
    pool: input.pool,
    realSurnames: collectRealSurnames(input),
  });

  const drafts = draftPlayers(input, squad, warnings);
  applySheets(input, squad, drafts);
  const { players, playerAliasById } = buildPlayers(drafts, squad, scrambler);
  const official = buildOfficials(input, scrambler);
  const { venues, venueAliasByName } = buildVenues(input.games);

  const context: GameContext = {
    squad,
    playerAliasById,
    venueAliasByName,
    cupRound: cupRounds(input.games.filter((game) => /^copa/i.test(game.phaseName))),
    official,
    reports: input.reports,
    warnings,
  };
  const games = [...input.games]
    .sort((a, b) => byId(a.gameId, b.gameId))
    .map((raw) => buildGame(raw, context));

  const dataset: DemoDataset = {
    schemaVersion: 1,
    alias: config.alias,
    name: config.name,
    discipline: config.discipline,
    organization: config.organization,
    tournament: { ...config.tournament, emblem: 'emblems/tournament.png' },
    clubs: squad.clubs,
    teams: squad.teams,
    players,
    phases: buildPhases(input.games, squad),
    venues,
    games,
  };
  return { dataset, clubLogos: squad.clubLogos, warnings };
}
