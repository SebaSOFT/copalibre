import type { Kysely } from 'kysely';
import {
  type Database,
  CompetitionRepository,
  EnrollmentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { GroupResponse, CreateGroupRequest, RenameRequest } from '../dto/zones-groups.dto.js';
import { publicStage, resolveZone, adminStage, resolveGroup } from './context.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { throwConflict } from './errors.js';
import { NotFoundException } from '../http/error-contract.js';

export async function listGroups(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
): Promise<readonly GroupResponse[]> {
  const { stage } = await publicStage(db, organizationAlias, tournamentAlias, stageNumber);
  const zone = await resolveZone(db, stage.stageId, zoneNumber);
  const competition = new CompetitionRepository(db);
  const groups = await competition.listGroupsOfZone(zone.zoneId);
  const entrantIdsByGroup = await competition.listGroupEntrantIdsOfZone(zone.zoneId);
  const entrantIds = groups.flatMap((group) => entrantIdsByGroup.get(group.groupId) ?? []);
  const labels = await new EnrollmentRepository(db).resolveEntrantNames(entrantIds);

  return groups.map((group) => {
    const groupEntrantIds = entrantIdsByGroup.get(group.groupId) ?? [];
    return {
      ...group,
      entrantIds: groupEntrantIds,
      entrants: groupEntrantIds.map((entrantId) => {
        const label = labels.get(entrantId);
        return {
          entrantId,
          ...(label === undefined ? {} : { displayName: label.name }),
          ...(label?.abbreviation === undefined ? {} : { abbreviation: label.abbreviation }),
        };
      }),
    };
  });
}

export async function createGroup(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  body: CreateGroupRequest,
  request: RequestWithSubject,
): Promise<GroupResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  const competition = new CompetitionRepository(db);
  const existing = await competition.listGroupsOfZone(zone.zoneId);
  const number = body.number ?? existing.length + 1;
  try {
    return await withTransaction(db, (uow) =>
      competition.createGroup(uow, {
        zoneId: zone.zoneId,
        number,
        name: body.name,
        ...context.audit,
      }),
    );
  } catch (error) {
    throwConflict(error);
  }
}

export async function renameGroup(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  groupNumber: number,
  body: RenameRequest,
  request: RequestWithSubject,
): Promise<GroupResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  const group = await resolveGroup(db, zone.zoneId, groupNumber);
  return withTransaction(db, (uow) =>
    new CompetitionRepository(db).renameGroup(uow, {
      groupId: group.groupId,
      name: body.name,
      ...context.audit,
    }),
  );
}

export async function deleteGroup(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  groupNumber: number,
  request: RequestWithSubject,
): Promise<GroupResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  const group = await resolveGroup(db, zone.zoneId, groupNumber);
  try {
    return await withTransaction(db, (uow) =>
      new CompetitionRepository(db).deleteGroup(uow, {
        groupId: group.groupId,
        ...context.audit,
      }),
    );
  } catch (error) {
    throwConflict(error);
  }
}

export async function restoreGroup(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  zoneNumber: number,
  groupNumber: number,
  request: RequestWithSubject,
): Promise<GroupResponse> {
  const context = await adminStage(db, organizationAlias, tournamentAlias, stageNumber, request);
  const zone = await resolveZone(db, context.stage.stageId, zoneNumber);
  const repository = new CompetitionRepository(db);
  const group = await repository.findGroupByNumberIncludingDeleted(zone.zoneId, groupNumber);
  if (!group) throw new NotFoundException(`Group ${groupNumber} was not found`);
  try {
    return await withTransaction(db, (uow) =>
      repository.restoreGroup(uow, { groupId: group.groupId, ...context.audit }),
    );
  } catch (error) {
    throwConflict(error);
  }
}
