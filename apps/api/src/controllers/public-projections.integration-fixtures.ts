import { footballDescriptor } from '@copalibre/domain';
import { TournamentRepository, withTransaction, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import {
  PublicProjectionsController,
  PublicTournamentListingController,
} from './public-projections.controller.js';
import { PublicOrganizationClubController } from './public-organization-club.controller.js';

export function buildPublicProjectionsApp() {
  return buildTestApp([
    PublicProjectionsController,
    PublicTournamentListingController,
    PublicOrganizationClubController,
  ]);
}

export type PublicProjectionsApp = Awaited<ReturnType<typeof buildPublicProjectionsApp>>;

/** Seeds the published and draft tournaments every public projection test reads. */
export async function seedPublicProjectionTournaments(
  scratch: PublicProjectionsApp['scratch'],
  organizationId: string,
) {
  const tournaments = new TournamentRepository(scratch.db);
  const descriptor = {
    ...footballDescriptor({ name: { en: 'Football', es: 'Fútbol' } }),
    images: [{ key: 'modules/football/1.0.0/football-01.jpg' }],
  };

  const draftTournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
    await tournaments.saveDescriptor(uow, descriptor, {
      organizationId,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    return tournaments.create(uow, {
      organizationId,
      alias: 'copa-public-draft',
      name: 'Copa Public Draft',
      descriptor,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
  });

  const createdPublished = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
    return tournaments.create(uow, {
      organizationId,
      alias: 'copa-public-published',
      name: 'Copa Public Published',
      descriptor,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
  });

  const publishedTournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
    return tournaments.publish(uow, {
      tournamentId: createdPublished.tournamentId,
      organizationId,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
  });
  return { publishedTournament, draftTournament };
}
