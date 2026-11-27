import type { Kysely } from 'kysely';
import {
  type Database,
  TournamentRepository,
  withTransaction,
  InvariantViolationError,
  OrganizationRepository,
  PublicOverviewReadModel,
} from '@copalibre/persistence';
import type { RequestWithSubject } from '../auth/request-context.js';
import { TournamentResponse } from '../dto/organization.dto.js';
import { NotFoundException, ConflictException } from '../http/error-contract.js';
import { enforcePolicy } from '../policy/resource-policy.js';

export async function publish(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  request: RequestWithSubject,
): Promise<TournamentResponse> {
  const tournaments = new TournamentRepository(db);
  const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
  if (!tournament) {
    throw new NotFoundException(
      `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
      { errorCode: 'tournament-not-found' },
    );
  }

  const subject = request.subject;
  enforcePolicy({
    plane: 'admin-control',
    subject,
    resource: { organizationId: tournament.organizationId },
  });

  return withTransaction(db, (uow) =>
    tournaments.publish(uow, {
      tournamentId: tournament.tournamentId,
      organizationId: tournament.organizationId,
      actor: `user:${subject?.subjectId ?? 'unknown'}`,
      authorizationContext: (subject?.scopes ?? []).join(' '),
    }),
  );
}

export async function archive(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  request: RequestWithSubject,
): Promise<TournamentResponse> {
  const tournaments = new TournamentRepository(db);
  const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
  if (!tournament) {
    throw new NotFoundException(
      `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
      { errorCode: 'tournament-not-found' },
    );
  }

  const subject = request.subject;
  enforcePolicy({
    plane: 'admin-control',
    subject,
    resource: { organizationId: tournament.organizationId },
  });

  try {
    return await withTransaction(db, (uow) =>
      tournaments.archive(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: tournament.organizationId,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      }),
    );
  } catch (error) {
    // An illegal transition is a state conflict, not a malformed request —
    // matches the existing InvariantViolationError -> 409 convention
    // (installation-bootstrap.controller.ts, seeding.controller.ts).
    if (error instanceof InvariantViolationError)
      throw new ConflictException(error.message, { errorCode: 'tournament-conflict' });
    throw error;
  }
}

export async function listActive(
  db: Kysely<Database>,
  organizationAlias: string,
  request: RequestWithSubject,
): Promise<readonly TournamentResponse[]> {
  const organization = await new OrganizationRepository(db).findByAlias(organizationAlias);
  if (!organization) {
    throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: organization.organizationId },
  });

  const tournaments = await new TournamentRepository(db).listActiveByOrganization(
    organization.organizationId,
  );
  const overviewReadModel = new PublicOverviewReadModel(db);

  return Promise.all(
    tournaments.map(async (t) => {
      if (t.status === 'finished' || t.status === 'archived' || t.status === 'draft') {
        return t;
      }
      const matches = await overviewReadModel.matchesForTournament(t.tournamentId);
      if (matches.length > 0 && matches.every((m) => m.status === 'finalized')) {
        return { ...t, status: 'finished' as const };
      }
      if (matches.some((m) => m.status === 'in-progress' || m.status === 'finalized')) {
        return { ...t, status: 'started' as const };
      }
      return t;
    }),
  );
}
