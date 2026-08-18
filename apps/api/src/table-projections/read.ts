import { NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  computeStandings,
  projectTableLayout,
  type CollectedFigure,
  type TableProjectionActor,
  type TableRow,
} from '@copalibre/tournament-engine';
import { aggregateTo } from '@copalibre/tournament-engine';
import {
  findTableLayout,
  resolveEffectiveTableLayouts,
  type ActorGranularity,
  type CompetitionGranularity,
  type DisciplineDescriptor,
  type StatisticCollector,
  type TableLayoutDefinition,
} from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  StageReadModel,
  StatisticRepository,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import { standingsPipeline } from '../standings/pipeline.js';

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
}

export interface TableProjectionResult {
  readonly layout: TableLayoutDefinition;
  readonly rows: readonly TableRow[];
  readonly projectionVersion: number;
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
 * `statistic_totals` by 0016/0090's pipeline, read via `StatisticRepository`)
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

  const statisticFigures =
    scope.stageId && layout.entityGranularity === 'team'
      ? await statisticsBridgeFigures(db, {
          descriptor,
          stageId: scope.stageId,
          groupId: scope.groupId,
          codes: [...referencedCodes].filter(
            (code) => !collectorByCode.has(code) && statisticCodes.has(code),
          ),
        })
      : [];

  const figures = [...collectorFigures, ...statisticFigures];

  const actors =
    layout.entityGranularity === 'team'
      ? await teamActors(db, figures)
      : layout.entityGranularity === 'person'
        ? await personActors(db, matchIds, figures)
        : [];

  const projection = projectTableLayout(figures, layout, { actors });
  const projectionVersion = await maxStatisticProjectionVersion(db, matchIds);

  return { layout, rows: projection.rows, projectionVersion };
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
    readonly stageId: string;
    readonly groupId?: string;
    readonly codes: readonly string[];
  },
): Promise<readonly CollectedFigure[]> {
  if (input.codes.length === 0) return [];

  const record = await new StageReadModel(db).stageRecord(input.stageId, input.groupId);
  if (!record) return [];

  const standings = computeStandings(
    input.descriptor,
    record.entrantIds,
    record.outcomes,
    standingsPipeline(input.descriptor, record.overrides),
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
  return figures;
}

async function teamActors(
  db: Kysely<Database>,
  figures: readonly CollectedFigure[],
): Promise<readonly TableProjectionActor[]> {
  const entrantIds = [...new Set(figures.map((figure) => figure.actorId))];
  if (entrantIds.length === 0) return [];

  const names = await new EnrollmentRepository(db).resolveEntrantNames(entrantIds);
  return entrantIds.map((entrantId) => ({
    actorId: entrantId,
    entrantId,
    name: names.get(entrantId)?.name ?? entrantId,
  }));
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

  for (const row of rows) {
    for (const member of row.roster_members) {
      if (!candidateIds.has(member.personId)) continue;
      nameOf.set(member.personId, member.name);
      entrantOf.set(member.personId, row.entrant_id);
      const roles = rolesOf.get(member.personId) ?? new Set<string>();
      for (const role of member.roles ?? []) roles.add(role);
      rolesOf.set(member.personId, roles);
    }
  }

  const entrantIds = [...new Set(entrantOf.values())];
  const entrantNames = await new EnrollmentRepository(db).resolveEntrantNames(entrantIds);

  return [...candidateIds].map((personId) => {
    const entrantId = entrantOf.get(personId);
    const teamName = entrantId ? entrantNames.get(entrantId)?.name : undefined;
    const roles = rolesOf.get(personId);
    return {
      actorId: personId,
      name: nameOf.get(personId) ?? personId,
      ...(teamName === undefined ? {} : { teamName }),
      ...(roles && roles.size > 0 ? { roles: [...roles] } : {}),
    };
  });
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
