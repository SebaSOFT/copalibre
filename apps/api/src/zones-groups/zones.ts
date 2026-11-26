import type { Kysely } from 'kysely';
import {
  type Database,
  CompetitionRepository,
  withTransaction,
  TournamentRepository,
} from '@copalibre/persistence';
import {
  ZoneResponse,
  CreateZoneRequest,
  RenameRequest,
  ZoneConfigurationRequest,
} from '../dto/zones-groups.dto.js';
import { publicStage, adminStage, resolveZone } from './context.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { throwConflict } from './errors.js';
import { NotFoundException, BadRequestException } from '../http/error-contract.js';
import {
  validateZoneFormat,
  type TournamentFormat,
  effectiveFormat,
  isPlacementFormat,
  validateSeriesDeclaration,
  type Zone,
  type Stage,
} from '@copalibre/domain';
import { zoneSeriesOverrides, ownZoneSeriesOf } from '../controllers/stage-series.js';

export async function listZones(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
): Promise<readonly ZoneResponse[]> {
  const { stage } = await publicStage(db, organizationAlias, tournamentAlias, stageNumber);
  return zoneResponses(
    db,
    stage,
    await new CompetitionRepository(db).listZonesOfStage(stage.stageId),
  );
}

export async function createZone(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  body: CreateZoneRequest,
  request: RequestWithSubject,
): Promise<ZoneResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const competition = new CompetitionRepository(db);
  const existing = await competition.listZonesOfStage(context.stage.stageId);
  const number = body.number ?? existing.length + 1;
  try {
    const created = await withTransaction(db, (uow) =>
      competition.createZone(uow, {
        stageId: context.stage.stageId,
        number,
        name: body.name,
        ...context.audit,
      }),
    );
    return (await zoneResponses(db, context.stage, [created]))[0] as ZoneResponse;
  } catch (error) {
    throwConflict(error);
  }
}

export async function renameZone(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  body: RenameRequest,
  request: RequestWithSubject,
): Promise<ZoneResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  const renamed = await withTransaction(db, (uow) =>
    new CompetitionRepository(db).renameZone(uow, {
      zoneId: zone.zoneId,
      name: body.name,
      ...context.audit,
    }),
  );
  return (await zoneResponses(db, context.stage, [renamed]))[0] as ZoneResponse;
}

export async function configureZone(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  body: ZoneConfigurationRequest,
  request: RequestWithSubject,
): Promise<ZoneResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  const tournaments = new TournamentRepository(db);

  if (typeof body.format === 'string') {
    const descriptor = await tournaments.findDescriptor(
      context.tournament.disciplineRef.descriptorId,
      context.tournament.disciplineRef.version,
    );
    if (!descriptor)
      throw new NotFoundException('Tournament discipline is not installed', {
        errorCode: 'zone-group-not-found',
      });
    const valid = validateZoneFormat(
      zone,
      body.format as TournamentFormat,
      descriptor.availableFormats,
    );
    if (!valid.ok)
      throw new BadRequestException(valid.error.message, {
        errorCode: 'zone-group-bad-request',
      });
  }

  const nextFormat =
    body.format === undefined
      ? effectiveFormat(zone, context.stage)
      : ((body.format ?? context.stage.format) as TournamentFormat);
  if (body.series != null) {
    // A placement format produces an ordering, not two sides that could contest a series.
    if (isPlacementFormat(nextFormat))
      throw new BadRequestException(
        `Format "${nextFormat}" produces an ordering rather than two sides, so a zone playing it cannot declare a series`,
        { errorCode: 'zone-group-bad-request' },
      );
    const validated = validateSeriesDeclaration(body.series);
    if (!validated.ok)
      throw new BadRequestException(validated.error.message, {
        errorCode: 'zone-group-bad-request',
      });
  }

  const ruleset =
    body.series === undefined
      ? undefined
      : await tournaments.findLatestRuleset(context.tournamentId);
  if (body.series !== undefined && !ruleset)
    throw new BadRequestException(
      'This tournament has no configured ruleset to attach a zone series declaration to',
      { errorCode: 'zone-group-bad-request' },
    );

  try {
    const updated = await withTransaction(db, async (uow) => {
      const competition = new CompetitionRepository(db);
      await competition.assertStageHasNoFixtures(uow, context.stage.stageId);
      let current: Zone = zone;
      if (body.format !== undefined) {
        current = await competition.setZoneFormat(uow, {
          zoneId: zone.zoneId,
          format: (body.format as TournamentFormat | null) ?? null,
          ...context.audit,
        });
      }
      if (body.series !== undefined && ruleset) {
        const overrides = zoneSeriesOverrides(zone.zoneId, body.series);
        if (await tournaments.findLatestStageConfiguration(context.stage.stageId)) {
          await tournaments.updateStageConfiguration(uow, {
            stageId: context.stage.stageId,
            changedOverrides: overrides,
            ...context.audit,
          });
        } else {
          await tournaments.createStageConfiguration(uow, {
            stageId: context.stage.stageId,
            rulesetId: ruleset.rulesetId,
            overrides,
            ...context.audit,
          });
        }
      }
      return current;
    });
    return (await zoneResponses(db, context.stage, [updated]))[0] as ZoneResponse;
  } catch (error) {
    throwConflict(error);
  }
}

export async function deleteZone(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  request: RequestWithSubject,
): Promise<ZoneResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  try {
    const deleted = await withTransaction(db, (uow) =>
      new CompetitionRepository(db).deleteZone(uow, {
        zoneId: zone.zoneId,
        ...context.audit,
      }),
    );
    return (await zoneResponses(db, context.stage, [deleted]))[0] as ZoneResponse;
  } catch (error) {
    throwConflict(error);
  }
}

export async function restoreZone(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  request: RequestWithSubject,
): Promise<ZoneResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const repository = new CompetitionRepository(db);
  const zone = await repository.findZoneByNumberIncludingDeleted(context.stage.stageId, zoneNumber);
  if (!zone) throw new NotFoundException(`Zone ${zoneNumber} was not found`);
  try {
    const restored = await withTransaction(db, (uow) =>
      repository.restoreZone(uow, { zoneId: zone.zoneId, ...context.audit }),
    );
    return (await zoneResponses(db, context.stage, [restored]))[0] as ZoneResponse;
  } catch (error) {
    throwConflict(error);
  }
}

export async function zoneEntrants(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
): Promise<readonly string[]> {
  const { stage } = await publicStage(db, organizationAlias, tournamentAlias, stageNumber);
  const zone = await resolveZone(db, stage.stageId, zoneNumber);
  return new CompetitionRepository(db).listEntrantIdsOfZone(zone.zoneId);
}

/** Zones with the format they play and the series they declare themselves, if any. */
export async function zoneResponses(
  db: Kysely<Database>,
  stage: Pick<Stage, 'stageId' | 'format'>,
  zones: readonly Zone[],
): Promise<ZoneResponse[]> {
  const configuration = await new TournamentRepository(db).findLatestStageConfiguration(
    stage.stageId,
  );
  return zones.map((zone) => {
    const series = ownZoneSeriesOf(configuration?.overrides, zone.zoneId);
    return {
      ...zone,
      effectiveFormat: effectiveFormat(zone, stage),
      ...(series === undefined ? {} : { series }),
    };
  });
}
