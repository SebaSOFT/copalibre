import { NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  computeStandings,
  projectTableLayout,
  type CollectedFigure,
  type TableCell,
  type TableProjectionActor,
  type TableRow,
} from '@copalibre/tournament-engine';
import { aggregateTo } from '@copalibre/tournament-engine';
import {
  IMPLICIT_GROUP_NAME,
  effectiveFormat,
  isImplicitZone,
  findTableLayout,
  primaryScoreOf,
  producesStandingsTable,
  resolveEffectiveTableLayouts,
  type ActorGranularity,
  type CompetitionGranularity,
  type DisciplineDescriptor,
  type LocalizedLabel,
  type SeriesAccountingGrain,
  type StatisticCollector,
  type TableLayoutDefinition,
  type TournamentFormat,
} from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  StageReadModel,
  stageMatchOrdinals,
  StatisticRepository,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import { standingsPipeline } from '../standings/pipeline.js';
import { readStageSeries } from '../controllers/stage-series.js';
import { entrantVisibilityById, type PublicPersonVisibility } from '../public-person-visibility.js';
import { describeColumns } from './column-descriptions.js';

export interface TableProjectionScope {
  readonly organizationId: string;
  readonly tournament: {
    readonly tournamentId: string;
    readonly disciplineRef: { readonly descriptorId: string; readonly version: string };
  };
  /** Absent reads the whole tournament; present narrows to one stage. */
  readonly stageId?: string;
  /** Optional pool within a stage; its fixture membership is the read boundary. */
  readonly groupId?: string;
  /** Optional club filter by alias within `organizationId`; takes precedence over `clubId`. */
  readonly clubAlias?: string;
  /** Optional club filter: only include rows for entrants belonging to this club. */
  readonly clubId?: string;
}

export type TableProjectionRow = TableRow & {
  readonly clubId?: string;
  readonly clubAlias?: string;
  readonly emblemObjectId?: string;
  readonly hiddenAtRequest?: boolean;
  readonly publicProfileAvailable?: boolean;
};

export interface TableProjectionResult {
  readonly layout: TableLayoutDefinition;
  readonly rows: readonly TableProjectionRow[];
  readonly projectionVersion: number;
  /**
   * The accounting grain in force for this layout's stage, when the layout
   * bridges `computeStandings`' own accounting (team-granularity, stage-scoped).
   * Absent for a tournament-scoped or non-team layout, which has no series
   * grain to report.
   */
  readonly grain?: SeriesAccountingGrain;
  /**
   * The layout's own column whose value is a `count`-aggregated statistic —
   * present only alongside `grain`, since that is the one column the grain
   * changes the unit of.
   */
  readonly countColumnCode?: string;
  /** The full wording behind abbreviated headers, keyed by column code; a column with none is absent. */
  readonly columnDescriptions: Readonly<Record<string, string | LocalizedLabel>>;
}

/**
 * One ranked block of a stage's table.
 *
 * A grouped stage ranks within each group, because a group table that mixes
 * groups together ranks nobody against anybody they actually played. A stage
 * with no groups is one segment covering the stage — so a reader looking for
 * "the leader of this phase" needs no knowledge of the stage's format, which
 * is the point: `computeStandings` takes no format argument, so an elimination
 * bracket ranks its entrants from recorded outcomes exactly as a league does.
 */
export interface TableProjectionSegment {
  /** Absent when the segment covers a stage that has no groups. */
  readonly groupId?: string;
  readonly groupName?: string;
  /** The zone the group belongs to; absent for a stage that has only its implicit zone. */
  readonly zoneName?: string;
  readonly rows: readonly TableProjectionRow[];
}

export interface SegmentedTableProjectionResult extends TableProjectionResult {
  readonly segments: readonly TableProjectionSegment[];
}

export interface TableLayoutSummary {
  readonly code: string;
  readonly target: TableLayoutDefinition['target'];
  readonly label: TableLayoutDefinition['label'];
  readonly entityGranularity: TableLayoutDefinition['entityGranularity'];
}

/**
 * Every table layout in effect for a tournament (discipline defaults, or the
 * tournament ruleset's override when its field policy permits one) — enough
 * for a client to build a tab bar without fetching a whole projection first.
 */
export async function listEffectiveTableLayouts(
  db: Kysely<Database>,
  tournament: {
    readonly tournamentId: string;
    readonly disciplineRef: { readonly descriptorId: string; readonly version: string };
  },
): Promise<readonly TableLayoutSummary[]> {
  const tournamentRepo = new TournamentRepository(db);
  const descriptor = await tournamentRepo.findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  if (!descriptor) {
    throw new NotFoundException(
      `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
    );
  }

  const ruleset = await tournamentRepo.findLatestRuleset(tournament.tournamentId);
  return resolveEffectiveTableLayouts(descriptor, ruleset?.overrides).map((layout) => ({
    code: layout.code,
    target: layout.target,
    label: layout.label,
    entityGranularity: layout.entityGranularity,
  }));
}

/**
 * Reads and projects one table layout for a tournament- or stage-scoped
 * request.
 *
 * Two figure sources feed `projectTableLayout`, bridged into the same
 * `CollectedFigure` shape: a discipline's declared `collectors` (folded into
 * `statistic_totals` by the statistics pipeline, read via `StatisticRepository`)
 * and its declared `statistics` (entrant-scoped accounting `computeStandings`
 * already produces from recorded outcomes, never written to
 * `statistic_totals` at all). A `collector`-kind column source may name
 * either, per `validateTableLayoutReferences`'s own two-vocabulary rule — the
 * statistics bridge only applies to a `team`-granularity, stage-scoped
 * layout, since `computeStandings` itself is stage-scoped accounting.
 */
export async function readTableProjection(
  db: Kysely<Database>,
  scope: TableProjectionScope,
  layoutCode: string,
): Promise<TableProjectionResult> {
  const tournamentRepo = new TournamentRepository(db);
  const descriptor = await tournamentRepo.findDescriptor(
    scope.tournament.disciplineRef.descriptorId,
    scope.tournament.disciplineRef.version,
  );
  if (!descriptor) {
    throw new NotFoundException(
      `Discipline ${scope.tournament.disciplineRef.descriptorId}@${scope.tournament.disciplineRef.version} is not installed`,
    );
  }

  const ruleset = await tournamentRepo.findLatestRuleset(scope.tournament.tournamentId);
  const layout = findTableLayout(descriptor, layoutCode, ruleset?.overrides);
  if (!layout) throw new NotFoundException(`No table layout "${layoutCode}"`);

  const competitionGranularity: CompetitionGranularity = scope.stageId ? 'stage' : 'tournament';
  const competitionId = scope.stageId ?? scope.tournament.tournamentId;

  const matchIds = scope.stageId
    ? (await new StageReadModel(db).matches(scope.stageId, scope.groupId)).map(
        (match) => match.matchId,
      )
    : await new CompetitionRepository(db).listFinalizedMatches({
        organizationId: scope.organizationId,
        tournamentId: scope.tournament.tournamentId,
      });

  const referencedCodes = collectorCodesReferencedBy(layout);
  const collectorByCode = new Map((descriptor.collectors ?? []).map((one) => [one.code, one]));
  const statisticCodes = new Set(descriptor.statistics.map((one) => one.code));

  const collectorFigures = await figuresForCollectors(db, {
    organizationId: scope.organizationId,
    codes: [...referencedCodes].filter((code) => {
      const collector = collectorByCode.get(code);
      return (
        collector !== undefined &&
        (scope.groupId === undefined || collector.granularity.competition === 'match')
      );
    }),
    collectorByCode,
    entityGranularity: layout.entityGranularity,
    competitionGranularity,
    competitionId,
    matchIds,
  });

  const bridged =
    scope.stageId && layout.entityGranularity === 'team'
      ? await statisticsBridgeFigures(db, {
          descriptor,
          tournamentId: scope.tournament.tournamentId,
          stageId: scope.stageId,
          groupId: scope.groupId,
          codes: [...referencedCodes].filter(
            (code) => !collectorByCode.has(code) && statisticCodes.has(code),
          ),
        })
      : undefined;

  const figures = [...collectorFigures, ...(bridged?.figures ?? [])];

  const actors =
    layout.entityGranularity === 'team'
      ? await teamActors(db, figures)
      : layout.entityGranularity === 'person'
        ? await personActors(db, matchIds, figures, {
            organizationId: scope.organizationId,
            tournamentId: scope.tournament.tournamentId,
          })
        : [];

  const projection = projectTableLayout(figures, layout, { actors });
  const projectionVersion = await maxStatisticProjectionVersion(db, matchIds);

  let rows = projection.rows;
  if (scope.clubAlias !== undefined) {
    const matchingEntrantIds = await resolveClubAliasEntrantIds(
      db,
      scope.organizationId,
      scope.tournament.tournamentId,
      scope.clubAlias,
    );
    rows = rows.filter(
      (row) => row.entrantId !== undefined && matchingEntrantIds.has(row.entrantId),
    );
  } else if (scope.clubId !== undefined) {
    const matchingEntrantIds = await resolveClubEntrantIds(
      db,
      scope.tournament.tournamentId,
      scope.clubId,
    );
    rows = rows.filter(
      (row) => row.entrantId !== undefined && matchingEntrantIds.has(row.entrantId),
    );
  }

  const entrantIds = [...new Set(rows.flatMap((row) => (row.entrantId ? [row.entrantId] : [])))];
  const entrantDetails = await new EnrollmentRepository(db).resolveEntrantPodiumDetails(entrantIds);
  rows = rows.map((row) => {
    const details = row.entrantId ? entrantDetails.get(row.entrantId) : undefined;
    return {
      ...row,
      ...(details?.clubId === undefined ? {} : { clubId: details.clubId }),
      ...(details?.clubAlias === undefined || details.clubAlias === ''
        ? {}
        : { clubAlias: details.clubAlias }),
      ...(details?.emblemObjectId === undefined ? {} : { emblemObjectId: details.emblemObjectId }),
    };
  });

  // The column whose value is a `count`-aggregated statistic — the one whose
  // unit the declared grain actually changes. `played`/`heats`/`rounds` are
  // discipline vocabulary; the rule is written against the aggregation mode,
  // per `match-series`' own note that a statistic named `played` is a
  // football-descriptor convention, not a platform concept.
  const countStatisticCodes = new Set(
    descriptor.statistics
      .filter((statistic) => statistic.aggregation === 'count')
      .map((s) => s.code),
  );
  const countColumnCode = layout.columns.find(
    (column) => column.source.kind === 'collector' && countStatisticCodes.has(column.source.code),
  )?.code;

  return {
    layout,
    rows,
    projectionVersion,
    columnDescriptions: describeColumns(layout, descriptor),
    ...(bridged?.grain === undefined ? {} : { grain: bridged.grain, countColumnCode }),
  };
}

export interface PlayerStatisticsMatchIdentity {
  readonly stageNumber: number;
  readonly matchNumber: number;
}

export interface PlayerMatchStatisticsRow {
  readonly match: PlayerStatisticsMatchIdentity;
  readonly scheduledAt?: string;
  readonly side: 'home' | 'away';
  readonly opponentName: string;
  readonly opponentAbbreviation?: string;
  readonly opponentClubAlias?: string;
  readonly ownScore?: number;
  readonly opponentScore?: number;
  readonly cells: Readonly<Record<string, TableCell>>;
}

export interface PlayerStatisticsDrilldownResult {
  readonly layout: TableLayoutDefinition;
  /** Absent when the player has no recorded roster appearance anywhere in the tournament. */
  readonly tournamentTotal?: Readonly<Record<string, TableCell>>;
  /** One row per finalized match the player is rostered in, ordered by stage then match number. */
  readonly matches: readonly PlayerMatchStatisticsRow[];
}

/**
 * One player's declared statistics at tournament-total and per-match scope,
 * for the public profile drilldown.
 *
 * The tournament total reuses `readTableProjection` unchanged — it is
 * byte-identical to that player's own leaderboard row, composite/computed
 * columns included. A match row is a *separate* per-match projection using
 * only the layout's `collector`-kind columns: `composite` (a ratio) and
 * `computed` (an arbitrary expression) are aggregate-shaped by construction
 * and either meaningless or trivially degenerate against one match's
 * figures (e.g. a "per match" rate on a single match).
 */
export async function readPlayerStatisticsDrilldown(
  db: Kysely<Database>,
  scope: {
    readonly organizationId: string;
    readonly tournament: {
      readonly tournamentId: string;
      readonly disciplineRef: { readonly descriptorId: string; readonly version: string };
      readonly includesMinors?: boolean;
      readonly showYouthProfiles?: boolean;
    };
  },
  personId: string,
  layoutCode: string,
): Promise<PlayerStatisticsDrilldownResult> {
  const tournamentRepo = new TournamentRepository(db);
  const descriptor = await tournamentRepo.findDescriptor(
    scope.tournament.disciplineRef.descriptorId,
    scope.tournament.disciplineRef.version,
  );
  if (!descriptor) {
    throw new NotFoundException(
      `Discipline ${scope.tournament.disciplineRef.descriptorId}@${scope.tournament.disciplineRef.version} is not installed`,
    );
  }

  const ruleset = await tournamentRepo.findLatestRuleset(scope.tournament.tournamentId);
  const layout = findTableLayout(descriptor, layoutCode, ruleset?.overrides);
  if (!layout) throw new NotFoundException(`No table layout "${layoutCode}"`);
  if (layout.entityGranularity !== 'person' && layout.entityGranularity !== 'player') {
    throw new NotFoundException(`Table layout "${layoutCode}" is not a person-granularity layout`);
  }

  const whole = await readTableProjection(
    db,
    { organizationId: scope.organizationId, tournament: scope.tournament },
    layoutCode,
  );
  const totalRow = whole.rows.find((row) => row.actorId === personId);

  const matchIds = await new CompetitionRepository(db).listFinalizedMatches({
    organizationId: scope.organizationId,
    tournamentId: scope.tournament.tournamentId,
  });
  if (matchIds.length === 0) {
    return {
      layout,
      ...(totalRow === undefined ? {} : { tournamentTotal: totalRow.cells }),
      matches: [],
    };
  }

  const [identities, matchContexts] = await Promise.all([
    matchPublicIdentities(db, scope.tournament.tournamentId, matchIds),
    loadDrilldownMatchContexts(db, scope.tournament, matchIds, personId),
  ]);

  const matchLayout: TableLayoutDefinition = {
    ...layout,
    columns: layout.columns.filter((column) => column.source.kind === 'collector'),
  };
  const collectorByCode = new Map((descriptor.collectors ?? []).map((one) => [one.code, one]));
  const referencedCodes = matchLayout.columns
    .filter((column) => column.source.kind === 'collector')
    .map((column) => (column.source as { readonly kind: 'collector'; readonly code: string }).code);

  const matches: PlayerMatchStatisticsRow[] = [];
  for (const matchId of matchIds) {
    const identity = identities.get(matchId);
    const context = matchContexts.byMatchId.get(matchId);
    if (!identity || !context) continue;

    const figures = await figuresForCollectors(db, {
      organizationId: scope.organizationId,
      codes: referencedCodes,
      collectorByCode,
      entityGranularity: layout.entityGranularity,
      competitionGranularity: 'match',
      competitionId: matchId,
      matchIds: [matchId],
    });
    const projection = projectTableLayout(figures, matchLayout, { actors: [context.actor] });
    const row = projection.rows.find((one) => one.actorId === personId);
    if (!row) continue;

    matches.push({
      match: identity,
      ...summarizeDrilldownMatch(
        context,
        descriptor,
        matchContexts.entrantDetails,
        matchContexts.entrantVisibility,
      ),
      cells: row.cells,
    });
  }

  matches.sort(
    (a, b) =>
      a.match.stageNumber - b.match.stageNumber || a.match.matchNumber - b.match.matchNumber,
  );

  return {
    layout,
    ...(totalRow === undefined ? {} : { tournamentTotal: totalRow.cells }),
    matches,
  };
}

interface DrilldownMatchContext {
  readonly actor: TableProjectionActor;
  readonly side: 'home' | 'away';
  readonly opponentEntrantId?: string;
  readonly scheduledAt?: string;
  readonly result: unknown;
}

async function loadDrilldownMatchContexts(
  db: Kysely<Database>,
  tournament: {
    readonly tournamentId: string;
    readonly includesMinors?: boolean;
    readonly showYouthProfiles?: boolean;
  },
  matchIds: readonly string[],
  personId: string,
): Promise<{
  readonly byMatchId: ReadonlyMap<string, DrilldownMatchContext>;
  readonly entrantDetails: Awaited<ReturnType<EnrollmentRepository['resolveEntrantPodiumDetails']>>;
  readonly entrantVisibility: ReadonlyMap<string, PublicPersonVisibility>;
}> {
  const [matchRows, rosterRows] = await Promise.all([
    db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .leftJoin('match_schedule_assignments', (join) =>
        join
          .onRef('match_schedule_assignments.match_id', '=', 'matches.match_id')
          .on('match_schedule_assignments.published', '=', true),
      )
      .leftJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .select([
        'matches.match_id',
        'matches.result',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'schedule_slots.starts_at',
      ])
      .where('matches.match_id', 'in', matchIds)
      .execute(),
    db
      .selectFrom('match_rosters')
      .select(['match_id', 'entrant_id', 'roster_members'])
      .where('match_id', 'in', matchIds)
      .execute(),
  ]);

  const rosterByMatch = new Map<
    string,
    {
      readonly entrantId: string;
      readonly member: {
        readonly personId: string;
        readonly number?: number | string;
        readonly name: string;
        readonly nationality?: string;
        readonly roles?: readonly string[];
      };
    }
  >();
  for (const row of rosterRows) {
    const member = row.roster_members.find((one) => one.personId === personId);
    if (member) rosterByMatch.set(row.match_id, { entrantId: row.entrant_id, member });
  }

  const byMatchId = new Map<string, DrilldownMatchContext>();
  const opponentEntrantIds = new Set<string>();
  for (const row of matchRows) {
    const rostered = rosterByMatch.get(row.match_id);
    if (!rostered) continue;
    const side =
      rostered.entrantId === row.home_entrant_id
        ? 'home'
        : rostered.entrantId === row.away_entrant_id
          ? 'away'
          : undefined;
    if (!side) continue;

    const opponentEntrantId =
      (side === 'home' ? row.away_entrant_id : row.home_entrant_id) ?? undefined;
    if (opponentEntrantId) opponentEntrantIds.add(opponentEntrantId);

    const { member } = rostered;
    byMatchId.set(row.match_id, {
      actor: {
        actorId: personId,
        entrantId: rostered.entrantId,
        name: member.name,
        ...(member.roles && member.roles.length > 0 ? { roles: [...member.roles] } : {}),
        ...(member.nationality === undefined ? {} : { nationality: member.nationality }),
      },
      side,
      opponentEntrantId,
      scheduledAt:
        row.starts_at === null ? undefined : new Date(Number(row.starts_at)).toISOString(),
      result: row.result,
    });
  }

  const ids = [...opponentEntrantIds];
  const [entrantDetails, entrantVisibility] = await Promise.all([
    new EnrollmentRepository(db).resolveEntrantPodiumDetails(ids),
    entrantVisibilityById(db, tournament, ids),
  ]);

  return { byMatchId, entrantDetails, entrantVisibility };
}

function summarizeDrilldownMatch(
  context: DrilldownMatchContext,
  descriptor: DisciplineDescriptor,
  entrantDetails: Awaited<ReturnType<EnrollmentRepository['resolveEntrantPodiumDetails']>>,
  entrantVisibility: ReadonlyMap<string, PublicPersonVisibility>,
): Omit<PlayerMatchStatisticsRow, 'match' | 'cells'> {
  const opponentId = context.opponentEntrantId;
  const details = opponentId ? entrantDetails.get(opponentId) : undefined;
  const visibility = opponentId ? entrantVisibility.get(opponentId) : undefined;
  const hidden = visibility?.hiddenAtRequest === true;
  const profileAvailable = visibility?.publicProfileAvailable !== false;

  const result = context.result as {
    readonly sides?: readonly { readonly statistics?: Record<string, number> }[];
  } | null;
  const scores = result?.sides?.map((side) => primaryScoreOf(side.statistics, descriptor));
  const ownIndex = context.side === 'home' ? 0 : 1;
  const opponentIndex = context.side === 'home' ? 1 : 0;
  const ownScore = scores?.[ownIndex];
  const opponentScore = scores?.[opponentIndex];

  return {
    ...(context.scheduledAt === undefined ? {} : { scheduledAt: context.scheduledAt }),
    side: context.side,
    opponentName: hidden ? '' : (details?.name ?? 'Unknown'),
    ...(hidden || !profileAvailable || details?.abbreviation === undefined
      ? {}
      : { opponentAbbreviation: details.abbreviation }),
    ...(hidden || details?.clubAlias === undefined ? {} : { opponentClubAlias: details.clubAlias }),
    ...(ownScore === undefined ? {} : { ownScore }),
    ...(opponentScore === undefined ? {} : { opponentScore }),
  };
}

/**
 * A stage's table projection, split into one ranked block per group.
 *
 * Reads the whole-stage projection for `rows` — unchanged, so a caller that
 * only wants the merged table keeps what it had — then adds a segment per
 * group. The alternative a client would otherwise be pushed into is a request
 * per group plus the zone and group listings needed to discover them, which
 * for a page rendered server-side is `1 + zones + groups` round trips to
 * answer one question.
 */
export async function readSegmentedTableProjection(
  db: Kysely<Database>,
  scope: TableProjectionScope,
  layoutCode: string,
): Promise<SegmentedTableProjectionResult> {
  const whole = await readTableProjection(db, scope, layoutCode);
  if (scope.stageId === undefined || scope.groupId !== undefined) {
    return { ...whole, segments: [{ rows: whole.rows }] };
  }

  const competition = new CompetitionRepository(db);
  const allZones = await competition.listZonesOfStage(scope.stageId);
  const stage = await db
    .selectFrom('stages')
    .select('format')
    .where('stage_id', '=', scope.stageId)
    .executeTakeFirst();
  const stageFormat = (stage?.format ?? 'round-robin') as TournamentFormat;

  /*
    A stage whose zones play different formats ranks only the zones whose format produces a table:
    a knockout zone has a bracket, not a points table, and ranking it beside a league would put
    entrants who never played each other in one list. A stage whose zones all play its own format
    is untouched.
  */
  const heterogeneous = allZones.some(
    (zone) => zone.format !== undefined && zone.format !== stageFormat,
  );
  const zones = heterogeneous
    ? allZones.filter((zone) =>
        producesStandingsTable(effectiveFormat(zone, { format: stageFormat })),
      )
    : allZones;
  const groups = (
    await Promise.all(
      zones.map(async (zone) =>
        (await competition.listGroupsOfZone(zone.zoneId)).map((group) => ({ zone, group })),
      ),
    )
  ).flat();

  /*
    A stage that was never drawn into groups still has one: `createFixtures`
    makes an implicit zone and group so every fixture has a scope. That is a
    storage device, not something a reader should be shown — and its name is a
    fixed `IMPLICIT_GROUP_NAME`, which a caller would otherwise print verbatim
    as a heading in whatever language that constant happens to be written in.
    So it reports as the undivided stage it is.
  */
  const undivided =
    !heterogeneous &&
    (groups.length === 0 || (groups.length === 1 && groups[0]?.group.name === IMPLICIT_GROUP_NAME));
  if (undivided) return { ...whole, segments: [{ rows: whole.rows }] };

  const segments = await Promise.all(
    groups.map(async ({ zone, group }) => {
      const scoped = await readTableProjection(
        db,
        { ...scope, groupId: group.groupId },
        layoutCode,
      );
      // A zone's implicit group is a storage device; its heading is the zone's own name.
      const groupName =
        heterogeneous && group.name === IMPLICIT_GROUP_NAME ? zone.name : group.name;
      return {
        groupId: group.groupId,
        groupName,
        ...(isImplicitZone(zone) ? {} : { zoneName: zone.name }),
        rows: scoped.rows,
      };
    }),
  );
  // The merged table of a mixed stage is its table zones' rows, each zone ranked on its own.
  return heterogeneous
    ? { ...whole, rows: segments.flatMap((segment) => segment.rows), segments }
    : { ...whole, segments };
}

/** Every collector/statistic code a layout's columns or filter could resolve. */
function collectorCodesReferencedBy(layout: TableLayoutDefinition): ReadonlySet<string> {
  const codes = new Set<string>();
  for (const column of layout.columns) {
    if (column.source.kind === 'collector') codes.add(column.source.code);
    if (column.source.kind === 'composite') {
      codes.add(column.source.numerator);
      codes.add(column.source.denominator);
    }
  }
  if (layout.filter?.minSamples) codes.add(layout.filter.minSamples.collectorCode);
  return codes;
}

/**
 * The stage ordinal of every match of a tournament, keyed by match id: the same 1-based position
 * the public match route and the matches view address a match by, taken from each stage's full,
 * unscoped match list. `matches.number` cannot stand in for it, being a per-fixture series index.
 */
export async function stageOrdinalsOf(
  db: Kysely<Database>,
  tournamentId: string,
): Promise<ReadonlyMap<string, number>> {
  const stages = await new CompetitionRepository(db).listStagesOfTournament(tournamentId);
  const readModel = new StageReadModel(db);
  const perStage = await Promise.all(
    stages.map(async (stage) => {
      const records = await readModel.matches(stage.stageId);
      const ordinals = stageMatchOrdinals(records);
      const byMatchId = new Map(ordinals);
      for (const record of records) {
        const ordinal = ordinals.get(record.matchId);
        if (ordinal === undefined) continue;
        for (const game of record.games) {
          if (!byMatchId.has(game.matchId)) byMatchId.set(game.matchId, ordinal);
        }
      }
      return byMatchId;
    }),
  );
  return new Map(perStage.flatMap((ordinals) => [...ordinals]));
}

/**
 * Maps each given `matchId` to the public identity its match report is
 * reachable at — `(stageNumber, matchNumber)`, never the internal `matchId`
 * itself, per the "a public read never receives a natural key" boundary.
 */
export async function matchPublicIdentities(
  db: Kysely<Database>,
  tournamentId: string,
  matchIds: readonly string[],
): Promise<ReadonlyMap<string, PlayerStatisticsMatchIdentity>> {
  if (matchIds.length === 0) return new Map();

  const [stages, ordinalsByMatchId, rows] = await Promise.all([
    new CompetitionRepository(db).listStagesOfTournament(tournamentId),
    stageOrdinalsOf(db, tournamentId),
    db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['matches.match_id', 'fixtures.stage_id'])
      .where('matches.match_id', 'in', matchIds)
      .execute(),
  ]);
  const stageNumberById = new Map(stages.map((stage) => [stage.stageId, stage.number]));

  const result = new Map<string, PlayerStatisticsMatchIdentity>();
  for (const row of rows) {
    const stageNumber = stageNumberById.get(row.stage_id);
    const matchNumber = ordinalsByMatchId.get(row.match_id);
    if (stageNumber === undefined || matchNumber === undefined) continue;
    result.set(row.match_id, { stageNumber, matchNumber });
  }
  return result;
}

/**
 * Resolves each person's shirt number from their most recent finalized match roster in a
 * tournament, ordered by published `scheduled_at DESC` (nulls last), then `stageNumber DESC`,
 * then stage ordinal `DESC`. Empty/blank numbers are ignored.
 */
export async function latestFinalizedShirtNumbers(
  db: Kysely<Database>,
  input: {
    readonly organizationId: string;
    readonly tournamentId: string;
    readonly personIds?: readonly string[];
  },
): Promise<ReadonlyMap<string, number | string>> {
  const finalizedMatchIds = await new CompetitionRepository(db).listFinalizedMatches({
    organizationId: input.organizationId,
    tournamentId: input.tournamentId,
  });
  if (finalizedMatchIds.length === 0) return new Map();

  const filterIds = input.personIds ? new Set(input.personIds) : undefined;
  if (filterIds && filterIds.size === 0) return new Map();

  const [ordinalsByMatchId, matchRows, rosterRows] = await Promise.all([
    stageOrdinalsOf(db, input.tournamentId),
    db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
      .leftJoin('match_schedule_assignments', (join) =>
        join
          .onRef('match_schedule_assignments.match_id', '=', 'matches.match_id')
          .on('match_schedule_assignments.published', '=', true),
      )
      .leftJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .select(['matches.match_id', 'stages.number as stage_number', 'schedule_slots.starts_at'])
      .where('matches.match_id', 'in', finalizedMatchIds)
      .execute(),
    db
      .selectFrom('match_rosters')
      .select(['match_id', 'roster_members'])
      .where('match_id', 'in', finalizedMatchIds)
      .execute(),
  ]);

  const rostersByMatch = new Map<string, typeof rosterRows>();
  for (const row of rosterRows) {
    rostersByMatch.set(row.match_id, [...(rostersByMatch.get(row.match_id) ?? []), row]);
  }

  const sortedMatches = [...matchRows].sort((a, b) =>
    compareMatchesLatestFirst(a, b, ordinalsByMatchId),
  );

  const result = new Map<string, number | string>();
  for (const match of sortedMatches) {
    for (const roster of rostersByMatch.get(match.match_id) ?? []) {
      for (const member of roster.roster_members) {
        if (filterIds && !filterIds.has(member.personId)) continue;
        if (result.has(member.personId) || !hasShirtNumber(member.number)) continue;
        result.set(member.personId, member.number);
      }
    }
  }
  return result;
}

function compareMatchesLatestFirst(
  a: {
    readonly match_id: string;
    readonly stage_number: number;
    readonly starts_at: string | null;
  },
  b: {
    readonly match_id: string;
    readonly stage_number: number;
    readonly starts_at: string | null;
  },
  ordinalsByMatchId: ReadonlyMap<string, number>,
): number {
  const aTime = a.starts_at === null ? undefined : Number(a.starts_at);
  const bTime = b.starts_at === null ? undefined : Number(b.starts_at);
  if (aTime !== undefined && bTime !== undefined && aTime !== bTime) return bTime - aTime;
  if (aTime !== undefined && bTime === undefined) return -1;
  if (aTime === undefined && bTime !== undefined) return 1;
  if (a.stage_number !== b.stage_number) return b.stage_number - a.stage_number;
  return (ordinalsByMatchId.get(b.match_id) ?? 0) - (ordinalsByMatchId.get(a.match_id) ?? 0);
}

function hasShirtNumber(value: number | string | undefined | null): value is number | string {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return Number.isFinite(value);
}

async function figuresForCollectors(
  db: Kysely<Database>,
  input: {
    readonly organizationId: string;
    readonly codes: readonly string[];
    readonly collectorByCode: ReadonlyMap<string, StatisticCollector>;
    readonly entityGranularity: ActorGranularity;
    readonly competitionGranularity: CompetitionGranularity;
    readonly competitionId: string;
    readonly matchIds: readonly string[];
  },
): Promise<readonly CollectedFigure[]> {
  const statistics = new StatisticRepository(db);
  const matchIdSet = new Set(input.matchIds);
  const result: CollectedFigure[] = [];

  for (const code of input.codes) {
    const collector = input.collectorByCode.get(code);
    if (!collector) continue;

    if (collector.granularity.actor !== input.entityGranularity) {
      // A collector declared at a finer/coarser actor grain than the table's
      // entityGranularity would need a membership-based actor rollup
      // (person -> team -> club, as `@copalibre/statistics-refold`'s
      // `readRolledUp` does for a single-competition read) this projection
      // path does not implement. Every collector this catalogue ships is
      // already declared at its table's own granularity — a documented gap,
      // not a silent wrong answer.
      continue;
    }

    if (collector.granularity.competition === input.competitionGranularity) {
      // Already stored at the scope's own grain — one precisely scoped query.
      const stored = await statistics.rawFigures({
        organizationId: input.organizationId,
        collectorCode: code,
        actorGranularity: collector.granularity.actor,
        competitionGranularity: collector.granularity.competition,
        competitionId: input.competitionId,
      });
      result.push(...stored);
      continue;
    }

    if (collector.granularity.competition !== 'match') {
      // A collector stored between 'match' and the scope's own grain (e.g.
      // 'segment') would need a second rollup step this read path does not
      // implement. Every collector this catalogue ships is stored at
      // 'match', matching the common case.
      continue;
    }

    // Match-grain rows, rolled up to the scope's competition grain. Fetched
    // without a competitionId filter — `StatisticRepository` has no
    // batched IN-list query yet — then narrowed to this scope's matches in
    // memory; acceptable at the row counts this platform targets (a
    // regional/amateur installation's per-tournament figures), but a
    // natural place to add a batched query if that stops being true.
    const stored = await statistics.rawFigures({
      organizationId: input.organizationId,
      collectorCode: code,
      actorGranularity: collector.granularity.actor,
      competitionGranularity: 'match',
    });
    const inScope = stored.filter((figure) => matchIdSet.has(figure.competitionId));
    if (inScope.length === 0) continue;

    const rolled = aggregateTo(
      inScope,
      collector.measure,
      { competition: input.competitionGranularity },
      { competitionAt: () => input.competitionId },
    );
    result.push(...rolled);
  }

  return result;
}

async function statisticsBridgeFigures(
  db: Kysely<Database>,
  input: {
    readonly descriptor: DisciplineDescriptor;
    readonly tournamentId: string;
    readonly stageId: string;
    readonly groupId?: string;
    readonly codes: readonly string[];
  },
): Promise<{
  readonly figures: readonly CollectedFigure[];
  /** Absent for a stage declaring no series — there is no grain to report. */
  readonly grain: SeriesAccountingGrain | undefined;
}> {
  const seriesDeclaration = await readStageSeries(db, {
    tournamentId: input.tournamentId,
    stageId: input.stageId,
    zoneId:
      input.groupId === undefined
        ? undefined
        : await new CompetitionRepository(db).findGroupZoneId(input.groupId),
  });
  const grain: SeriesAccountingGrain | undefined =
    seriesDeclaration === undefined
      ? undefined
      : seriesDeclaration.standingsAccounting === 'series'
        ? 'series'
        : 'match';

  if (input.codes.length === 0) return { figures: [], grain };

  const record = await new StageReadModel(db).stageRecord(input.stageId, input.groupId);
  if (!record) return { figures: [], grain };

  const standings = computeStandings(
    input.descriptor,
    record.entrantIds,
    record.outcomes,
    standingsPipeline(input.descriptor, record.overrides),
    undefined,
    { seriesDeclaration },
  );

  const figures: CollectedFigure[] = [];
  for (const row of standings.rows) {
    for (const code of input.codes) {
      const value = row.statistics[code];
      if (value === undefined) continue;
      figures.push({
        collectorCode: code,
        actorGranularity: 'team',
        actorId: row.entrantId,
        competitionGranularity: 'stage',
        competitionId: input.stageId,
        value,
        samples: 1,
      });
    }
  }
  return { figures, grain: seriesDeclaration === undefined ? undefined : standings.grain };
}

async function teamActors(
  db: Kysely<Database>,
  figures: readonly CollectedFigure[],
): Promise<readonly TableProjectionActor[]> {
  const entrantIds = [...new Set(figures.map((figure) => figure.actorId))];
  if (entrantIds.length === 0) return [];

  const names = await new EnrollmentRepository(db).resolveEntrantNames(entrantIds);
  return entrantIds.map((entrantId) => {
    const entry = names.get(entrantId);
    const name = entry?.name ?? entrantId;
    return {
      actorId: entrantId,
      entrantId,
      name,
      entrantName: name,
      ...(entry?.abbreviation === undefined ? {} : { entrantAbbreviation: entry.abbreviation }),
    };
  });
}

/**
 * Person-granularity actors, read straight from `match_rosters` — every
 * roster entry already carries the person's display name, the entrant they
 * played for, and their per-match roles, so this needs one query plus one
 * batched entrant-name lookup rather than a separate `persons` join.
 *
 * A person who appeared for more than one entrant within scope (a
 * mid-tournament transfer) keeps whichever roster entry this loop visits
 * last — the same "first/last membership wins" simplification
 * `readRolledUpTotals` already documents for the reverse lookup.
 */
async function personActors(
  db: Kysely<Database>,
  matchIds: readonly string[],
  figures: readonly CollectedFigure[],
  tournamentScope?: { readonly organizationId: string; readonly tournamentId: string },
): Promise<readonly TableProjectionActor[]> {
  const candidateIds = new Set(figures.map((figure) => figure.actorId));
  if (candidateIds.size === 0 || matchIds.length === 0) return [];

  const rows = await db
    .selectFrom('match_rosters')
    .select(['entrant_id', 'roster_members'])
    .where('match_id', 'in', matchIds)
    .execute();

  const nameOf = new Map<string, string>();
  const entrantOf = new Map<string, string>();
  const rolesOf = new Map<string, Set<string>>();
  /** Snapshotted at roster-selection time alongside name/number/roles. */
  const nationalityOf = new Map<string, string>();

  for (const row of rows) {
    for (const member of row.roster_members) {
      if (!candidateIds.has(member.personId)) continue;
      nameOf.set(member.personId, member.name);
      entrantOf.set(member.personId, row.entrant_id);
      if (member.nationality !== undefined) nationalityOf.set(member.personId, member.nationality);
      const roles = rolesOf.get(member.personId) ?? new Set<string>();
      for (const role of member.roles ?? []) roles.add(role);
      rolesOf.set(member.personId, roles);
    }
  }

  const entrantIds = [...new Set(entrantOf.values())];
  const [entrantNames, shirtNumbers] = await Promise.all([
    new EnrollmentRepository(db).resolveEntrantNames(entrantIds),
    tournamentScope === undefined
      ? Promise.resolve(new Map<string, number | string>())
      : latestFinalizedShirtNumbers(db, {
          organizationId: tournamentScope.organizationId,
          tournamentId: tournamentScope.tournamentId,
          personIds: [...candidateIds],
        }),
  ]);

  return [...candidateIds].map((personId) => {
    const entrantId = entrantOf.get(personId);
    const entry = entrantId ? entrantNames.get(entrantId) : undefined;
    const roles = rolesOf.get(personId);
    const shirtNumber = shirtNumbers.get(personId);
    return {
      actorId: personId,
      ...(entrantId === undefined ? {} : { entrantId }),
      name: nameOf.get(personId) ?? personId,
      // `teamName` feeds the `team-name` column source; `entrantName`/
      // `entrantAbbreviation` feed the row's own affiliation fields — both
      // read off the same resolved entrant, for two different consumers.
      ...(entry?.name === undefined ? {} : { teamName: entry.name, entrantName: entry.name }),
      ...(entry?.abbreviation === undefined ? {} : { entrantAbbreviation: entry.abbreviation }),
      ...(roles && roles.size > 0 ? { roles: [...roles] } : {}),
      ...(nationalityOf.has(personId) ? { nationality: nationalityOf.get(personId) } : {}),
      ...(shirtNumber === undefined ? {} : { shirtNumber }),
    };
  });
}

async function resolveClubAliasEntrantIds(
  db: Kysely<Database>,
  organizationId: string,
  tournamentId: string,
  clubAlias: string,
): Promise<ReadonlySet<string>> {
  const trimmed = clubAlias.trim();
  if (trimmed.length === 0) return new Set();

  const club = await db
    .selectFrom('clubs')
    .select('club_id')
    .where('organization_id', '=', organizationId)
    .where('alias', '=', trimmed)
    .executeTakeFirst();
  if (!club) return new Set();

  return resolveClubEntrantIds(db, tournamentId, club.club_id);
}

async function resolveClubEntrantIds(
  db: Kysely<Database>,
  tournamentId: string,
  clubId: string,
): Promise<ReadonlySet<string>> {
  const teamEntrants = await db
    .selectFrom('entrants')
    .innerJoin('teams', 'teams.team_id', 'entrants.team_id')
    .select('entrants.entrant_id')
    .where('entrants.tournament_id', '=', tournamentId)
    .where('teams.club_id', '=', clubId)
    .execute();

  const personEntrants = await db
    .selectFrom('entrants')
    .innerJoin('players', 'players.person_id', 'entrants.person_id')
    .innerJoin('teams', 'teams.team_id', 'players.team_id')
    .select('entrants.entrant_id')
    .where('entrants.tournament_id', '=', tournamentId)
    .where('teams.club_id', '=', clubId)
    .execute();

  const matchingIds = new Set<string>();
  for (const row of teamEntrants) matchingIds.add(row.entrant_id);
  for (const row of personEntrants) matchingIds.add(row.entrant_id);
  return matchingIds;
}

async function maxStatisticProjectionVersion(
  db: Kysely<Database>,
  matchIds: readonly string[],
): Promise<number> {
  if (matchIds.length === 0) return 0;
  const row = await db
    .selectFrom('projection_versions')
    .select((eb) => eb.fn.max('version').as('version'))
    .where('projection_type', '=', 'statistic-totals')
    .where('entity_id', 'in', matchIds)
    .executeTakeFirst();
  return Number(row?.version ?? 0);
}
