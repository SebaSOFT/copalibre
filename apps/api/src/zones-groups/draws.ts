import type { Kysely } from 'kysely';
import { type Database, CompetitionRepository, withTransaction } from '@copalibre/persistence';
import {
  DrawZonesRequest,
  DrawPreviewResponse,
  ConfirmZoneDrawResponse,
  DrawGroupsRequest,
  ConfirmGroupDrawResponse,
  ManualZoneAssignmentRequest,
  ManualZoneAssignmentResponse,
  ManualGroupAssignmentRequest,
  ManualGroupAssignmentResponse,
} from '../dto/zones-groups.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { adminStage, resolveZone, entrants } from './context.js';
import { zoneResponses } from './zones.js';
import { throwConflict } from './errors.js';
import { drawZones, drawGroups } from '@copalibre/tournament-engine';
import type { DrawConstraint } from '@copalibre/domain';
import { BadRequestException } from '../http/error-contract.js';

export async function previewZones(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  body: DrawZonesRequest,
  request: RequestWithSubject,
): Promise<DrawPreviewResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  return zoneDraw(db, context.tournamentId, body);
}

export async function confirmZones(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  body: DrawZonesRequest,
  request: RequestWithSubject,
): Promise<ConfirmZoneDrawResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const outcome = await zoneDraw(db, context.tournamentId, body);
  const competition = new CompetitionRepository(db);
  try {
    const persisted = await withTransaction(db, (uow) =>
      competition.assignZones(uow, {
        stageId: context.stage.stageId,
        assignment: outcome.assignment,
        constraints: constraintsOf(body.constraints),
        zoneCount: body.zoneCount,
        seed: body.seed,
        ...context.audit,
      }),
    );
    return { ...outcome, zones: await zoneResponses(db, context.stage, persisted.entities) };
  } catch (error) {
    throwConflict(error);
  }
}

export async function previewGroups(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  body: DrawGroupsRequest,
  request: RequestWithSubject,
): Promise<DrawPreviewResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  return groupDraw(db, context.tournamentId, zone.zoneId, body);
}

export async function confirmGroups(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  body: DrawGroupsRequest,
  request: RequestWithSubject,
): Promise<ConfirmGroupDrawResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  const outcome = await groupDraw(db, context.tournamentId, zone.zoneId, body);
  const competition = new CompetitionRepository(db);
  try {
    const persisted = await withTransaction(db, (uow) =>
      competition.assignGroups(uow, {
        zoneId: zone.zoneId,
        assignment: outcome.assignment,
        constraints: constraintsOf(body.constraints),
        groupCount: body.groupCount,
        seed: body.seed,
        ...context.audit,
      }),
    );
    return { ...outcome, groups: [...persisted.entities] };
  } catch (error) {
    throwConflict(error);
  }
}

export async function assignZonesManually(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  body: ManualZoneAssignmentRequest,
  request: RequestWithSubject,
): Promise<ManualZoneAssignmentResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const competition = new CompetitionRepository(db);
  try {
    const persisted = await withTransaction(db, (uow) =>
      competition.assignZonesManually(uow, {
        stageId: context.stage.stageId,
        assignment: body.assignment,
        zoneCount: body.zoneCount,
        ...context.audit,
      }),
    );
    return {
      assignment: assignmentResponse(persisted.assignment),
      zones: await zoneResponses(db, context.stage, persisted.entities),
    };
  } catch (error) {
    throwConflict(error);
  }
}

export async function assignGroupsManually(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  body: ManualGroupAssignmentRequest,
  request: RequestWithSubject,
): Promise<ManualGroupAssignmentResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  const competition = new CompetitionRepository(db);
  try {
    const persisted = await withTransaction(db, (uow) =>
      competition.assignGroupsManually(uow, {
        zoneId: zone.zoneId,
        assignment: body.assignment,
        groupCount: body.groupCount,
        ...context.audit,
      }),
    );
    return {
      assignment: assignmentResponse(persisted.assignment),
      groups: [...persisted.entities],
    };
  } catch (error) {
    throwConflict(error);
  }
}

export async function zoneDraw(
  db: Kysely<Database>,
  tournamentId: string,
  body: DrawZonesRequest,
): Promise<DrawPreviewResponse> {
  assertDrawInput(body.zoneCount, body.seed);
  const outcome = drawZones(
    await entrants(db, tournamentId),
    constraintsOf(body.constraints),
    body.zoneCount,
    body.seed,
  );
  return {
    assignment: assignmentResponse(outcome.assignment),
    seed: outcome.seed,
    steps: outcome.steps,
  };
}

export async function groupDraw(
  db: Kysely<Database>,
  tournamentId: string,
  zoneId: string,
  body: DrawGroupsRequest,
): Promise<DrawPreviewResponse> {
  assertDrawInput(body.groupCount, body.seed);
  const entrantIds = await new CompetitionRepository(db).listEntrantIdsOfZone(zoneId);
  const outcome = drawGroups(
    await entrants(db, tournamentId, entrantIds),
    constraintsOf(body.constraints),
    body.groupCount,
    body.seed,
  );
  return {
    assignment: assignmentResponse(outcome.assignment),
    seed: outcome.seed,
    steps: outcome.steps,
  };
}

export function constraintsOf(
  constraints: readonly unknown[] | undefined,
): readonly DrawConstraint[] {
  return (constraints ?? []) as readonly DrawConstraint[];
}

export function assertDrawInput(count: number, seed: number): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new BadRequestException('Draw count must be a positive integer', {
      errorCode: 'zone-group-bad-request',
    });
  }
  if (!Number.isInteger(seed))
    throw new BadRequestException('Draw seed must be an integer', {
      errorCode: 'zone-group-bad-request',
    });
}

export function assignmentResponse(assignment: {
  readonly groups?: Readonly<Record<string, number>>;
}): {
  readonly groups: Record<string, number>;
} {
  if (!assignment.groups)
    throw new BadRequestException('Expected a group assignment from the draw engine', {
      errorCode: 'zone-group-bad-request',
    });
  return { groups: { ...assignment.groups } };
}
