import { QualificationError } from '@copalibre/tournament-engine';
import { NotFoundException } from '../http/error-contract.js';
import { escapeCsvFormulaCell, stringifyCsv } from '@copalibre/domain/import-export';
import { CompetitionRepository, Database } from '@copalibre/persistence';
import { TableLayoutListResponse, TableProjectionResponse } from '../dto/table-projections.dto.js';
import { Kysely } from 'kysely';
import {
  listEffectiveTableLayouts,
  readSegmentedTableProjection,
  readTableProjection,
  type SegmentedTableProjectionResult,
  type TableProjectionResult,
  type TableProjectionRow,
} from '../table-projections/read.js';
import {
  segmentedTableResponse,
  tableResponse,
} from '../controllers/table-projections.controller.js';
import {
  evaluateStoredPromotion,
  promotionPlanFromStored,
} from '../controllers/promotion-plans.js';
import { personVisibility, personVisibilityById } from '../public-person-visibility.js';
import { isImplicitZone, type Tournament } from '@copalibre/domain';
import {
  type PublicPromotionBand,
  withPublicPromotionBands,
} from '../table-projections/public-promotion-bands.js';
import { resolvePublishedTournament } from './context.js';

function publicTableCsv(projection: TableProjectionResponse): string {
  const columnCodes = projection.columns.map((column) => column.code);
  const hasPromotionBands = (projection.promotionBands?.length ?? 0) > 0;
  const outputColumns = hasPromotionBands
    ? [...columnCodes, 'promotion_band', 'promotion_seed']
    : columnCodes;
  const rows = projection.rows.map((row) => ({
    ...Object.fromEntries(
      columnCodes.map((code) => [code, escapeCsvFormulaCell(row.cells[code]?.formatted ?? '')]),
    ),
    ...(hasPromotionBands
      ? {
          promotion_band: escapeCsvFormulaCell(row.promotionBandLabel ?? ''),
          promotion_seed: row.promotionSeed === undefined ? '' : String(row.promotionSeed),
        }
      : {}),
  }));
  return stringifyCsv(outputColumns, rows);
}

/**
 * Reads the `club` query value. A repeated `?club=a&club=b` arrives as an array; the first string
 * decides, and anything that is not a non-empty string is no filter.
 */
export function normalizeClubAliasQuery(club: unknown): string | undefined {
  const candidates: readonly unknown[] = Array.isArray(club) ? club : [club];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

/** The first string of a query value that may arrive repeated as an array; anything else is absent. */
export function firstQueryString(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value.find((entry) => typeof entry === 'string') : value;
  return typeof first === 'string' ? first : undefined;
}

async function publicPromotionBandsForStage(
  db: Kysely<Database>,
  tournament: Pick<Tournament, 'tournamentId' | 'disciplineRef'>,
  stage: { readonly stageId: string; readonly number: number },
): Promise<readonly PublicPromotionBand[]> {
  const competition = new CompetitionRepository(db);
  const zones = await competition.listZonesOfStage(stage.stageId);
  const result: PublicPromotionBand[] = [];

  for (const zone of zones) {
    const saved = await competition.findPromotionPlan(zone.zoneId);
    if (!saved) continue;
    const plan = promotionPlanFromStored(zone.zoneId, saved.nextStageId, saved.plan);
    if (plan.bands === undefined) continue;

    let outcome;
    try {
      outcome = await evaluateStoredPromotion(db, {
        tournamentId: tournament.tournamentId,
        tournament,
        sourceStageId: stage.stageId,
        zone,
        saved,
      });
    } catch (error) {
      // A tied or unfinished qualification cut has no stable public seed order yet. Keep the
      // configured legend, but do not mark rows as though that order were resolved.
      if (!(error instanceof QualificationError)) throw error;
    }

    const seedByEntrant = new Map(
      outcome?.combined.map((entrant, index) => [entrant.entrantId, index + 1]) ?? [],
    );
    let firstSeed = 1;
    for (const band of plan.bands) {
      const bandIndex = result.length;
      const seeds = (outcome?.bands?.[band.zoneRef] ?? []).flatMap((entrant) => {
        const seed = seedByEntrant.get(entrant.entrantId);
        return seed === undefined ? [] : [{ entrantId: entrant.entrantId, seed }];
      });
      result.push({
        label: band.zoneRef,
        ...(isImplicitZone(zone) ? {} : { sourceZoneName: zone.name }),
        index: bandIndex,
        firstSeed,
        lastSeed: firstSeed + band.count - 1,
        seeds,
      });
      firstSeed += band.count;
    }
  }
  return result;
}

async function protectPublicPersonRows<T extends TableProjectionResult>(
  db: Kysely<Database>,
  tournament: Tournament,
  result: T,
): Promise<T> {
  if (result.layout.entityGranularity !== 'person') return result;
  const segmentedResult =
    'segments' in result ? (result as T & SegmentedTableProjectionResult) : undefined;
  const rows = [
    ...result.rows,
    ...(segmentedResult?.segments.flatMap((segment) => segment.rows) ?? []),
  ];
  const visibilityById = await personVisibilityById(
    db,
    tournament,
    rows.map((row) => row.actorId),
  );
  const actorNameCodes = new Set(
    result.layout.columns
      .filter((column) => column.source.kind === 'actor-name')
      .map((column) => column.code),
  );
  const entrantNameCodes = new Set(
    result.layout.columns
      .filter(
        (column) => column.source.kind === 'entrant-name' || column.source.kind === 'team-name',
      )
      .map((column) => column.code),
  );
  const protectRows = (source: readonly TableProjectionRow[]): TableProjectionRow[] =>
    source.map((row) => {
      const visibility = visibilityById.get(row.actorId) ?? personVisibility(tournament);
      const { nationality, shirtNumber, ...withoutProtected } = row;
      const suppressedCodes = new Set([
        ...(visibility.hiddenAtRequest ? actorNameCodes : []),
        ...(!visibility.publicProfileAvailable ? entrantNameCodes : []),
      ]);
      const cells =
        suppressedCodes.size > 0
          ? Object.fromEntries(
              Object.entries(row.cells).map(([code, cell]) =>
                suppressedCodes.has(code)
                  ? [code, { ...cell, formatted: '', raw: undefined }]
                  : [code, cell],
              ),
            )
          : row.cells;
      return {
        ...withoutProtected,
        ...(!visibility.publicProfileAvailable
          ? {
              entrantName: undefined,
              entrantAbbreviation: undefined,
              clubId: undefined,
              clubAlias: undefined,
              emblemObjectId: undefined,
            }
          : {}),
        ...(visibility.hiddenAtRequest ? { actorName: '', hiddenAtRequest: true } : {}),
        publicProfileAvailable: visibility.publicProfileAvailable,
        ...(visibility.nationalityVisible && nationality !== undefined ? { nationality } : {}),
        ...(visibility.hiddenAtRequest || shirtNumber === undefined ? {} : { shirtNumber }),
        cells,
      };
    });

  if (segmentedResult !== undefined) {
    return {
      ...segmentedResult,
      rows: protectRows(result.rows),
      segments: segmentedResult.segments.map((segment) => ({
        ...segment,
        rows: protectRows(segment.rows),
      })),
    } as T;
  }
  return { ...result, rows: protectRows(result.rows) } as T;
}

export async function tableLayouts(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
): Promise<TableLayoutListResponse> {
  const { tournament } = await resolvePublishedTournament(db, organizationAlias, tournamentAlias);
  const layouts = await listEffectiveTableLayouts(db, {
    tournamentId: tournament.tournamentId,
    disciplineRef: tournament.disciplineRef,
  });
  return { layouts: layouts.map((layout) => ({ ...layout })) };
}

export async function tournamentTable(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  layoutCode: string,
  club?: string,
  clubId?: string,
): Promise<TableProjectionResponse> {
  const { tournament } = await resolvePublishedTournament(db, organizationAlias, tournamentAlias);
  const result = await readTableProjection(
    db,
    {
      organizationId: tournament.organizationId,
      tournament: {
        tournamentId: tournament.tournamentId,
        disciplineRef: tournament.disciplineRef,
      },
      clubAlias: normalizeClubAliasQuery(club),
      clubId: firstQueryString(clubId),
    },
    layoutCode,
  );
  return tableResponse(await protectPublicPersonRows(db, tournament, result));
}

export async function tournamentTableCsv(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  layoutCode: string,
  club?: string,
  clubId?: string,
): Promise<string> {
  const { tournament } = await resolvePublishedTournament(db, organizationAlias, tournamentAlias);
  const result = await readTableProjection(
    db,
    {
      organizationId: tournament.organizationId,
      tournament: {
        tournamentId: tournament.tournamentId,
        disciplineRef: tournament.disciplineRef,
      },
      clubAlias: normalizeClubAliasQuery(club),
      clubId: firstQueryString(clubId),
    },
    layoutCode,
  );
  return publicTableCsv(tableResponse(await protectPublicPersonRows(db, tournament, result)));
}

export async function stageTable(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumberStr: string,
  layoutCode: string,
  club?: string,
  clubId?: string,
): Promise<TableProjectionResponse> {
  const { tournament } = await resolvePublishedTournament(db, organizationAlias, tournamentAlias);
  const stageNumber = parseInt(stageNumberStr, 10);
  const stages = await new CompetitionRepository(db).listStagesOfTournament(
    tournament.tournamentId,
  );
  const stage = stages.find((candidate) => candidate.number === stageNumber);
  if (!stage)
    throw new NotFoundException(`No stage ${stageNumberStr} in tournament`, {
      errorCode: 'public-projection-not-found',
    });

  const result = await readSegmentedTableProjection(
    db,
    {
      organizationId: tournament.organizationId,
      tournament: {
        tournamentId: tournament.tournamentId,
        disciplineRef: tournament.disciplineRef,
      },
      stageId: stage.stageId,
      clubAlias: normalizeClubAliasQuery(club),
      clubId: firstQueryString(clubId),
    },
    layoutCode,
  );
  const protectedResult = await protectPublicPersonRows(db, tournament, result);
  const response = segmentedTableResponse(protectedResult);
  if (
    result.layout.target !== 'group-phase' ||
    (result.layout.entityGranularity !== 'team' && result.layout.entityGranularity !== 'club')
  ) {
    return response;
  }
  return withPublicPromotionBands(
    response,
    await publicPromotionBandsForStage(db, tournament, stage),
  );
}

export async function stageTableCsv(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumberStr: string,
  layoutCode: string,
  club?: string,
  clubId?: string,
): Promise<string> {
  const { tournament } = await resolvePublishedTournament(db, organizationAlias, tournamentAlias);
  const stageNumber = parseInt(stageNumberStr, 10);
  const stages = await new CompetitionRepository(db).listStagesOfTournament(
    tournament.tournamentId,
  );
  const stage = stages.find((candidate) => candidate.number === stageNumber);
  if (!stage)
    throw new NotFoundException(`No stage ${stageNumberStr} in tournament`, {
      errorCode: 'public-projection-not-found',
    });
  const result = await readSegmentedTableProjection(
    db,
    {
      organizationId: tournament.organizationId,
      tournament: {
        tournamentId: tournament.tournamentId,
        disciplineRef: tournament.disciplineRef,
      },
      stageId: stage.stageId,
      clubAlias: normalizeClubAliasQuery(club),
      clubId: firstQueryString(clubId),
    },
    layoutCode,
  );
  const protectedResult = await protectPublicPersonRows(db, tournament, result);
  let response = segmentedTableResponse(protectedResult);
  if (
    result.layout.target === 'group-phase' &&
    (result.layout.entityGranularity === 'team' || result.layout.entityGranularity === 'club')
  ) {
    response = withPublicPromotionBands(
      response,
      await publicPromotionBandsForStage(db, tournament, stage),
    );
  }
  return publicTableCsv(response);
}
