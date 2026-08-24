import type { INestApplication } from '@nestjs/common';
import { footballDescriptor, type TournamentProfile } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  TournamentProfileRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { TournamentsController } from './tournaments.controller.js';
import { TournamentProfilesController } from './tournament-profiles.controller.js';

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([
    TournamentsController,
    TournamentProfilesController,
  ]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('organization-scoped tournament routes', () => {
  it('404s a tournament alias that exists in no organization', async () => {
    const response = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/no-such-copa',
    });
    expect(response.statusCode).toBe(404);
  });

  it('404s a tournament that is still in draft state', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();

    const draftTournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-draft',
        name: 'Copa Draft',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });

    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${draftTournament.alias}`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('200s a tournament that is published', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();

    const created = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-published',
        name: 'Copa Published',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });

    const publishedTournament = await withTransaction(
      scratch.db as Kysely<Database>,
      async (uow) => {
        return tournaments.publish(uow, {
          tournamentId: created.tournamentId,
          organizationId,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      },
    );

    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${publishedTournament.alias}`,
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload as string).alias).toBe(publishedTournament.alias);
  });

  it('returns 404 for a draft tournament', async () => {
    const tournaments = new TournamentRepository(scratch.db as Kysely<Database>);
    const descriptor = footballDescriptor();
    const draft = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-draft-test',
        name: 'Copa Draft Test',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });

    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${draft.alias}`,
    });
    expect(response.statusCode).toBe(404);
  });

  it("lists the organization's active tournaments, excluding archived (0113)", async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const draft = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.create(uow, {
        organizationId,
        alias: 'copa-active-draft',
        name: 'Copa Active Draft',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const toArchive = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.create(uow, {
        organizationId,
        alias: 'copa-archived',
        name: 'Copa Archived',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    await scratch.db
      .updateTable('tournaments')
      .set({ status: 'archived' })
      .where('tournament_id', '=', toArchive.tournamentId)
      .execute();

    const noToken = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments',
    });
    expect(noToken.statusCode).toBe(401);

    const response = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    const aliases = (JSON.parse(response.payload as string) as { alias: string }[]).map(
      (t) => t.alias,
    );
    expect(aliases).toContain(draft.alias);
    expect(aliases).not.toContain(toArchive.alias);
  });

  it('creates a tournament with registration region, capacity, and check-in deadline (0132)', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const response = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
      payload: {
        alias: 'copa-completa',
        name: 'Copa Completa',
        descriptorId: descriptor.descriptorId,
        descriptorVersion: descriptor.version,
        format: 'round-robin',
        publicRegistration: true,
        requiresCheckIn: true,
        checkInClosesAt: '2026-09-01T12:00:00.000Z',
        region: 'Mendoza',
        capacity: 16,
      },
    });

    expect(response.statusCode).toBe(201);
    const created = JSON.parse(response.payload as string);
    expect(created.alias).toBe('copa-completa');

    const ruleset = await tournaments.findLatestRuleset(created.tournamentId);
    expect(ruleset?.overrides).toMatchObject({
      'registration.region': 'Mendoza',
      'registration.capacity': 16,
      'registration.checkInClosesAt': '2026-09-01T12:00:00.000Z',
      'registration.publicOpen': true,
      'registration.requiresCheckIn': true,
    });
  });

  it('creates a tournament instantiating a tournament profile and pre-creating declared stages (0132)', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const profileRepo = new TournamentProfileRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = footballDescriptor();

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const profile: TournamentProfile = {
      profileId: '01890000-0000-7000-8000-000000000001',
      alias: 'two-stage-cup',
      version: '1.0.0',
      name: 'Two Stage Cup',
      attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
      requires: [
        {
          capability: 'primary-scoring',
          satisfiedBy: ['goals-for'],
          necessity: 'required',
        },
      ],
      stages: [
        { number: 1, name: 'Group Stage', format: 'round-robin' },
        { number: 2, name: 'Final Stage', format: 'single-elimination' },
      ],
      points: { win: 3, draw: 1, loss: 0 },
      tiebreak: [],
    };

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      profileRepo.save(uow, profile, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const response = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
      payload: {
        alias: 'copa-with-profile',
        name: 'Copa With Profile',
        descriptorId: descriptor.descriptorId,
        descriptorVersion: descriptor.version,
        format: 'round-robin',
        publicRegistration: false,
        requiresCheckIn: false,
        profileId: profile.profileId,
        profileVersion: profile.version,
      },
    });

    expect(response.statusCode).toBe(201);
    const created = JSON.parse(response.payload as string);
    expect(created.profileRef).toEqual({
      profileId: profile.profileId,
      version: profile.version,
    });

    const stages = await competition.listStagesOfTournament(created.tournamentId);
    expect(stages.length).toBe(2);
    expect(stages.map((s) => ({ number: s.number, name: s.name, format: s.format }))).toEqual([
      { number: 1, name: 'Group Stage', format: 'round-robin' },
      { number: 2, name: 'Final Stage', format: 'single-elimination' },
    ]);
  });

  it('rejects capacity reduction below current accepted entrant count (0132)', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollments = new EnrollmentRepository(scratch.db);
    const descriptor = footballDescriptor();

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const tournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const created = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-capacity-test',
        name: 'Copa Capacity Test',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await tournaments.createRuleset(uow, {
        tournamentId: created.tournamentId,
        organizationId,
        descriptor,
        overrides: { 'registration.capacity': 4 },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });

      // Register 3 accepted entrants
      for (let i = 1; i <= 3; i++) {
        const team = await enrollments.createTeam(uow, {
          organizationId,
          name: `Team ${i}`,
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        const entrant = await enrollments.registerEntrant(uow, {
          organizationId,
          tournamentId: created.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
        await enrollments.setEntrantStatus(uow, {
          organizationId,
          entrantId: entrant.entrantId,
          status: 'accepted',
          actor: 'user:seed',
          authorizationContext: 'seed',
        });
      }

      return created;
    });

    // Attempting to set capacity to 2 (below 3 accepted) must throw InvariantViolationError
    await expect(
      withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.createRuleset(uow, {
          tournamentId: tournament.tournamentId,
          organizationId,
          descriptor,
          overrides: { 'registration.capacity': 2 },
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      ),
    ).rejects.toThrow(
      /Cannot reduce tournament capacity to 2: tournament already has 3 accepted entrants/,
    );
  });

  it('lists compatible tournament profiles for a descriptor and format (0132)', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const profileRepo = new TournamentProfileRepository(scratch.db);
    const descriptor = footballDescriptor();

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const profile: TournamentProfile = {
      profileId: '01890000-0000-7000-8000-000000000002',
      alias: 'compatible-cup',
      version: '1.0.0',
      name: 'Compatible Cup',
      attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
      requires: [
        {
          capability: 'primary-scoring',
          satisfiedBy: ['goals-for'],
          necessity: 'required',
        },
      ],
      stages: [{ number: 1, name: 'Cup', format: 'single-elimination' }],
      points: { win: 0, draw: 0, loss: 0 },
      tiebreak: [],
    };

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      profileRepo.save(uow, profile, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const response = await request({
      method: 'GET',
      url: `/tournament-profiles/compatible?descriptorId=${descriptor.descriptorId}&descriptorVersion=${descriptor.version}&format=single-elimination`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((p: { alias: string }) => p.alias === 'compatible-cup')).toBe(true);
  });
});
