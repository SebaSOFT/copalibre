import type { Kysely } from 'kysely';
import {
  type Database,
  EnrollmentRepository,
  TournamentRepository,
  CompetitionRepository,
} from '@copalibre/persistence';
import { NotFoundException } from '../http/error-contract.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { resolveTournament } from '../controllers/standings.controller.js';

export async function entrants(
  db: Kysely<Database>,
  tournamentId: string,
  entrantIds?: readonly string[],
) {
  const enrollment = new EnrollmentRepository(db);
  const accepted = (await enrollment.listEntrants(tournamentId)).filter(
    (entrant) => entrant.status === 'accepted',
  );
  const attributes = await enrollment.listTournamentAttributes(tournamentId);
  const selected =
    entrantIds === undefined
      ? accepted
      : accepted.filter((entrant) => entrantIds.includes(entrant.entrantId));
  return selected.map((entrant) => ({
    entrantId: entrant.entrantId,
    attributes: attributes.get(entrant.entrantId) ?? [],
  }));
}

export async function publicStage(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
) {
  const tournament = await new TournamentRepository(db).findByScopedAlias(
    organizationAlias,
    tournamentAlias,
  );
  if (!tournament || tournament.status === 'draft') {
    throw new NotFoundException(`No tournament "${tournamentAlias}" in "${organizationAlias}"`, {
      errorCode: 'zone-group-not-found',
    });
  }
  return stageOf(db, tournament.tournamentId, stageNumber);
}

export async function adminStage(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  request: RequestWithSubject,
) {
  const { organizationId, tournament } = await resolveTournament(db, {
    organizationAlias,
    tournamentAlias,
    request,
  });
  const { stage } = await stageOf(db, tournament.tournamentId, stageNumber);
  return {
    tournamentId: tournament.tournamentId,
    tournament,
    stage,
    audit: {
      organizationId,
      actor: `user:${request.subject?.subjectId ?? 'unknown'}`,
      authorizationContext: (request.subject?.scopes ?? []).join(' '),
    },
  };
}

export async function stageOf(db: Kysely<Database>, tournamentId: string, stageNumber: number) {
  const stage = (await new CompetitionRepository(db).listStagesOfTournament(tournamentId)).find(
    (candidate) => candidate.number === stageNumber,
  );
  if (!stage)
    throw new NotFoundException(`No stage ${stageNumber}`, { errorCode: 'zone-group-not-found' });
  return { stage };
}

export async function resolveZone(db: Kysely<Database>, stageId: string, zoneNumber: number) {
  const zone = (await new CompetitionRepository(db).listZonesOfStage(stageId)).find(
    (candidate) => candidate.number === zoneNumber,
  );
  if (!zone)
    throw new NotFoundException(`No zone ${zoneNumber}`, { errorCode: 'zone-group-not-found' });
  return zone;
}

export async function resolveGroup(db: Kysely<Database>, zoneId: string, groupNumber: number) {
  const group = (await new CompetitionRepository(db).listGroupsOfZone(zoneId)).find(
    (candidate) => candidate.number === groupNumber,
  );
  if (!group)
    throw new NotFoundException(`No group ${groupNumber}`, { errorCode: 'zone-group-not-found' });
  return group;
}
