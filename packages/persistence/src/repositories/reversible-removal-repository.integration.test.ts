import { type DisciplineDescriptor, winConditionScript } from '@copalibre/domain';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { IdentityPrincipalRepository } from './identity-principal-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { PersonalAccessTokenRepository } from './personal-access-token-repository.js';
import { ReversibleRemovalRepository } from './reversible-removal-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { TournamentRepository } from './tournament-repository.js';

const AUDIT = { actor: 'user:privacy-purge-test', authorizationContext: 'scope:privacy.manage' };

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: '99999999-9999-4999-8999-999999999999',
    alias: 'privacy-purge-test',
    version: '1.0.0',
    name: 'Privacy purge test',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    winCondition: winConditionScript('higher-score-wins', { unit: 'goals' }),
    notificationRuleCapabilities: [],
    defaults: { scoring: { pointsPerWin: 3 } },
    fieldPolicies: {
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
    },
  };
}

describe('reversible removal purge (integration)', () => {
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('reversible-removal-purge');
  });

  afterAll(async () => scratch?.drop());

  it('keeps soft-deleted records for 24 hours, then permanently removes them', async () => {
    const organizations = new OrganizationRepository(scratch.db);
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const schedules = new ScheduleRepository(scratch.db);
    const principals = new IdentityPrincipalRepository(scratch.db);
    const tokens = new PersonalAccessTokenRepository(scratch.db);
    const purge = new ReversibleRemovalRepository(scratch.db);

    const seeded = await withTransaction(scratch.db, async (uow) => {
      const organization = await organizations.create(uow, {
        alias: 'privacy-purge',
        name: 'Privacy purge',
        ...AUDIT,
      });
      const discipline = descriptor();
      await tournaments.saveDescriptor(uow, discipline, {
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      const tournament = await tournaments.create(uow, {
        organizationId: organization.organizationId,
        alias: 'privacy-purge-cup',
        name: 'Privacy purge cup',
        descriptor: discipline,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'League',
        format: 'round-robin',
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      const zone = await competition.createZone(uow, {
        stageId: stage.stageId,
        number: 1,
        name: 'Zone A',
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      const group = await competition.createGroup(uow, {
        zoneId: zone.zoneId,
        number: 1,
        name: 'Group A',
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      const venue = await schedules.createVenue(uow, {
        organizationId: organization.organizationId,
        alias: 'privacy-purge-court',
        name: 'Court to purge',
        concurrentCapacity: 1,
        ...AUDIT,
      });
      const principal = await principals.create(uow, {
        email: 'privacy-purge@example.com',
        ...AUDIT,
      });
      const token = await tokens.create(uow, {
        principalId: principal.principalId,
        label: 'Token to purge',
        scopes: ['copalibre.control'],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ...AUDIT,
      });
      await competition.deleteGroup(uow, {
        groupId: group.groupId,
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      await competition.deleteZone(uow, {
        zoneId: zone.zoneId,
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      await schedules.deleteVenue(uow, {
        venueId: venue.venueId,
        organizationId: organization.organizationId,
        actor: AUDIT.actor,
        authorizationContext: AUDIT.authorizationContext,
      });
      await tokens.revoke(uow, {
        tokenId: token.tokenId,
        principalId: principal.principalId,
        actor: AUDIT.actor,
        authorizationContext: AUDIT.authorizationContext,
      });
      return {
        groupId: group.groupId,
        zoneId: zone.zoneId,
        venueId: venue.venueId,
        tokenId: token.tokenId,
      };
    });

    const now = new Date('2026-10-27T12:00:00.000Z');
    const oneMillisecondBeforeExpiry = new Date(now.getTime() - 24 * 60 * 60 * 1000 + 1);
    await scratch.db
      .updateTable('zones')
      .set({ deleted_at: oneMillisecondBeforeExpiry })
      .where('zone_id', '=', seeded.zoneId)
      .execute();
    await scratch.db
      .updateTable('groups')
      .set({ deleted_at: oneMillisecondBeforeExpiry })
      .where('group_id', '=', seeded.groupId)
      .execute();
    await scratch.db
      .updateTable('venues')
      .set({ deleted_at: oneMillisecondBeforeExpiry })
      .where('venue_id', '=', seeded.venueId)
      .execute();
    await scratch.db
      .updateTable('personal_access_tokens')
      .set({ deleted_at: oneMillisecondBeforeExpiry })
      .where('token_id', '=', seeded.tokenId)
      .execute();

    await expect(purge.purgeExpired(now)).resolves.toEqual({
      venues: 0,
      zones: 0,
      groups: 0,
      tokens: 0,
    });
    await expect(
      scratch.db
        .selectFrom('venues')
        .select('venue_id')
        .where('venue_id', '=', seeded.venueId)
        .executeTakeFirst(),
    ).resolves.toBeDefined();
    await expect(
      scratch.db
        .selectFrom('zones')
        .select('zone_id')
        .where('zone_id', '=', seeded.zoneId)
        .executeTakeFirst(),
    ).resolves.toBeDefined();
    await expect(
      scratch.db
        .selectFrom('groups')
        .select('group_id')
        .where('group_id', '=', seeded.groupId)
        .executeTakeFirst(),
    ).resolves.toBeDefined();
    await expect(
      scratch.db
        .selectFrom('personal_access_tokens')
        .select('token_id')
        .where('token_id', '=', seeded.tokenId)
        .executeTakeFirst(),
    ).resolves.toBeDefined();

    const expired = new Date(oneMillisecondBeforeExpiry.getTime() - 1);
    await scratch.db
      .updateTable('zones')
      .set({ deleted_at: expired })
      .where('zone_id', '=', seeded.zoneId)
      .execute();
    await scratch.db
      .updateTable('groups')
      .set({ deleted_at: expired })
      .where('group_id', '=', seeded.groupId)
      .execute();
    await scratch.db
      .updateTable('venues')
      .set({ deleted_at: expired })
      .where('venue_id', '=', seeded.venueId)
      .execute();
    await scratch.db
      .updateTable('personal_access_tokens')
      .set({ deleted_at: expired })
      .where('token_id', '=', seeded.tokenId)
      .execute();

    await expect(purge.purgeExpired(now)).resolves.toEqual({
      venues: 1,
      zones: 1,
      groups: 1,
      tokens: 1,
    });
    await expect(
      scratch.db
        .selectFrom('venues')
        .select('venue_id')
        .where('venue_id', '=', seeded.venueId)
        .executeTakeFirst(),
    ).resolves.toBeUndefined();
    await expect(
      scratch.db
        .selectFrom('zones')
        .select('zone_id')
        .where('zone_id', '=', seeded.zoneId)
        .executeTakeFirst(),
    ).resolves.toBeUndefined();
    await expect(
      scratch.db
        .selectFrom('groups')
        .select('group_id')
        .where('group_id', '=', seeded.groupId)
        .executeTakeFirst(),
    ).resolves.toBeUndefined();
    await expect(
      scratch.db
        .selectFrom('personal_access_tokens')
        .select('token_id')
        .where('token_id', '=', seeded.tokenId)
        .executeTakeFirst(),
    ).resolves.toBeUndefined();
  });
});
