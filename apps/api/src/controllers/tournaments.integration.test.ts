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

function notifyAttachment(message = 'Event recorded') {
  return {
    hook: 'event.recorded',
    description: 'Notify operators after every event',
    script: {
      id: 'notify-on-event',
      rules: [
        {
          id: 'always-notify',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [
            {
              id: 'notify-operator',
              type: 'notify',
              options: {},
              params: [
                {
                  id: 'notification-title',
                  name: 'title',
                  type: 'simple_string',
                  value: 'Match update',
                  options: {},
                },
                {
                  id: 'notification-message',
                  name: 'message',
                  type: 'simple_string',
                  value: message,
                  options: {},
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

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
  it('exports a multi-stage tournament with profile, raw overrides, and compiled stage configuration', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const profiles = new TournamentProfileRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = footballDescriptor();
    const profile: TournamentProfile = {
      profileId: '01890000-0000-7000-8000-000000000134',
      alias: 'exportable-cup',
      version: '1.0.0',
      name: 'Exportable Cup',
      attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
      requires: [],
      stages: [
        { number: 1, name: 'Groups', format: 'round-robin' },
        { number: 2, name: 'Final', format: 'single-elimination' },
      ],
      points: { win: 3, draw: 1, loss: 0 },
      tiebreak: [],
    };
    await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await profiles.save(uow, profile, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });
    const createdResponse = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
      payload: {
        alias: 'copa-export-multi',
        name: 'Copa Export Multi',
        descriptorId: descriptor.descriptorId,
        descriptorVersion: descriptor.version,
        format: 'round-robin',
        publicRegistration: true,
        requiresCheckIn: false,
        region: 'Cuyo',
        capacity: 24,
        profileId: profile.profileId,
        profileVersion: profile.version,
        customScripts: [],
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json() as { tournamentId: string; rulesetId: string };
    const stages = await competition.listStagesOfTournament(created.tournamentId);
    const finalStage = stages.find((stage) => stage.number === 2);
    if (!finalStage) throw new Error('Expected final stage');
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.createStageConfiguration(uow, {
        stageId: finalStage.stageId,
        rulesetId: created.rulesetId,
        organizationId,
        overrides: { 'scoring.pointsPerWin': 4 },
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const noToken = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/copa-export-multi/export',
    });
    expect(noToken.statusCode).toBe(401);
    const foreign = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/copa-export-multi/export',
      token: 'organizer-org2',
    });
    expect(foreign.statusCode).toBe(403);

    const response = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/copa-export-multi/export',
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    const document = response.json() as {
      tournament: { profileRef?: { profileId: string; version: string } };
      ruleset: { rawOverrides: Record<string, unknown>; effective: { config: unknown } };
      seasons: {
        stages: {
          number: number;
          configuration: { rawOverrides: unknown; effective: { config: unknown } };
        }[];
      }[];
    };
    expect(document.tournament.profileRef).toEqual({
      profileId: profile.profileId,
      version: profile.version,
    });
    expect(document.ruleset.rawOverrides).toMatchObject({
      'registration.region': 'Cuyo',
      'registration.capacity': 24,
    });
    expect(document.seasons.flatMap((season) => season.stages)).toHaveLength(2);
    expect(
      document.seasons[0]?.stages.find((stage) => stage.number === 2)?.configuration,
    ).toMatchObject({
      rawOverrides: { 'scoring.pointsPerWin': 4 },
      effective: { config: { scoring: { pointsPerWin: 4 } } },
    });
  });

  it('exports a default-only single stage with every top-level section present', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = footballDescriptor();
    const tournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const created = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-export-default',
        name: 'Copa Export Default',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await tournaments.createRuleset(uow, {
        tournamentId: created.tournamentId,
        organizationId,
        descriptor,
        overrides: {},
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await competition.createStageInTournament(uow, {
        tournamentId: created.tournamentId,
        number: 1,
        name: 'Stage',
        format: 'round-robin',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return created;
    });
    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${tournament.alias}/export`,
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    const document = response.json() as {
      kind: string;
      tournament: unknown;
      ruleset: { rawOverrides: unknown; effective: unknown };
      seasons: { stages: { configuration: { rawOverrides: unknown; effective: unknown } }[] }[];
    };
    expect(document.kind).toBe('copalibre-tournament-configuration');
    expect(document.tournament).toBeDefined();
    expect(document.ruleset.rawOverrides).toEqual({});
    expect(document.ruleset.effective).toBeDefined();
    expect(document.seasons[0]?.stages[0]?.configuration.rawOverrides).toEqual({});
    expect(document.seasons[0]?.stages[0]?.configuration.effective).toBeDefined();

    // The export itself is a sensitive read, recorded with who and when
    // (openspec 0166, task 6.3).
    const read = await scratch.db
      .selectFrom('audit_log')
      .selectAll()
      .where('entity_id', '=', tournament.tournamentId)
      .where('action', '=', 'tournament.configuration-exported')
      .executeTakeFirstOrThrow();
    expect(read.actor).toBe('user:organizer-1');
    expect(read.resulting_state).toBeNull();
  });

  it('does not expose result, standings, event, or participant data after a result exists', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = footballDescriptor();
    const seeded = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-export-played',
        name: 'Copa Export Played',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor,
        overrides: { format: 'round-robin' },
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Stage',
        format: 'round-robin',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      if (!fixture) throw new Error('Expected fixture');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return { tournament, match };
    });
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.recordResult(uow, {
        matchId: seeded.match.matchId,
        result: { sides: [], recordedAt: '2026-08-24T12:00:00.000Z' },
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/${seeded.tournament.alias}/export`,
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    expect(collectObjectKeys(response.json())).not.toEqual(
      expect.arrayContaining([
        'matches',
        'result',
        'standings',
        'events',
        'participants',
        'persons',
      ]),
    );
  });

  it('exposes the exact authorized hook-script vocabulary', async () => {
    const noToken = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/custom-script-vocabulary',
    });
    expect(noToken.statusCode).toBe(401);

    const foreignOrganization = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/custom-script-vocabulary',
      token: 'organizer-org2',
    });
    expect(foreignOrganization.statusCode).toBe(403);

    const response = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/custom-script-vocabulary',
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    const vocabulary = response.json() as {
      hooks: string[];
      entries: { kind: string; type: string; authoring?: unknown }[];
    };
    expect(vocabulary.hooks).toEqual(['event.recorded']);
    expect(vocabulary.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'condition', type: 'compare_two_numbers' }),
        expect.objectContaining({ kind: 'action', type: 'notify' }),
        expect.objectContaining({ kind: 'parameter', type: 'simple_string' }),
      ]),
    );
    expect(vocabulary.entries.every((entry) => entry.authoring !== undefined)).toBe(true);
    expect(vocabulary.entries.some((entry) => entry.type === 'set-guard-outcome')).toBe(false);
  });

  it('creates, reads, and safely versions valid custom scripts before results', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const createdResponse = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
      payload: {
        alias: 'copa-custom-scripts',
        name: 'Copa Custom Scripts',
        descriptorId: descriptor.descriptorId,
        descriptorVersion: descriptor.version,
        format: 'round-robin',
        publicRegistration: false,
        requiresCheckIn: false,
        customScripts: [notifyAttachment()],
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json() as { tournamentId: string };

    const read = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/copa-custom-scripts/custom-scripts',
      token: 'organizer-org1',
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ customScripts: [notifyAttachment()] });

    const foreignUpdate = await request({
      method: 'PUT',
      url: '/organizations/liga-orbital/tournaments/copa-custom-scripts/custom-scripts',
      token: 'organizer-org2',
      payload: { customScripts: [] },
    });
    expect(foreignUpdate.statusCode).toBe(403);

    const updatedAttachment = notifyAttachment('Updated event message');
    const updated = await request({
      method: 'PUT',
      url: '/organizations/liga-orbital/tournaments/copa-custom-scripts/custom-scripts',
      token: 'organizer-org1',
      payload: { customScripts: [updatedAttachment] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ customScripts: [updatedAttachment] });
    expect((await tournaments.findLatestRuleset(created.tournamentId))?.version).toBe(2);
  });

  it('400s a custom-scripts replacement without a customScripts array, before reaching the controller', async () => {
    const response = await request({
      method: 'PUT',
      url: '/organizations/liga-orbital/tournaments/copa-custom-scripts/custom-scripts',
      token: 'organizer-org1',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an extra undocumented property with 400 when replacing custom scripts', async () => {
    const updated = await request({
      method: 'PUT',
      url: '/organizations/liga-orbital/tournaments/copa-custom-scripts/custom-scripts',
      token: 'organizer-org1',
      payload: { customScripts: [], unexpectedField: 'dropped' },
    });
    expect(updated.statusCode).toBe(400);
    const body = JSON.parse(updated.payload as string);
    expect(body.errorCode).toBe('bad-request');
    expect(body.message).toContain('property unexpectedField should not exist');
  });

  it('names an offending custom-script reference and blocks updates after a persisted result', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = footballDescriptor();
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const invalid = notifyAttachment() as {
      script: { rules: { actions: { type: string }[] }[] };
    };
    const invalidRule = invalid.script.rules[0];
    const invalidAction = invalidRule?.actions[0];
    if (!invalidAction) throw new Error('Expected notification action');
    invalidAction.type = 'launch-fireworks';
    const refused = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
      payload: {
        alias: 'copa-invalid-script',
        name: 'Copa Invalid Script',
        descriptorId: descriptor.descriptorId,
        descriptorVersion: descriptor.version,
        format: 'round-robin',
        publicRegistration: false,
        requiresCheckIn: false,
        customScripts: [invalid],
      },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.body).toContain('launch-fireworks');

    const unpublished = notifyAttachment() as {
      script: {
        rules: { actions: { params: { name: string; value: string; options: object }[] }[] }[];
      };
    };
    const unpublishedRule = unpublished.script.rules[0];
    const unpublishedAction = unpublishedRule?.actions[0];
    if (!unpublishedAction) throw new Error('Expected notification action');
    const message = unpublishedAction.params.find((parameter) => parameter.name === 'message');
    if (!message) throw new Error('Expected message parameter');
    message.value = '{{ roster.secretBudget }}';
    message.options = { expression: true };
    const unpublishedRefusal = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
      payload: {
        alias: 'copa-unpublished-expression',
        name: 'Copa Unpublished Expression',
        descriptorId: descriptor.descriptorId,
        descriptorVersion: descriptor.version,
        format: 'round-robin',
        publicRegistration: false,
        requiresCheckIn: false,
        customScripts: [unpublished],
      },
    });
    expect(unpublishedRefusal.statusCode).toBe(400);
    expect(unpublishedRefusal.body).toContain('roster.secretBudget');

    const tournament = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const created = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-script-lock',
        name: 'Copa Script Lock',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await tournaments.createRuleset(uow, {
        tournamentId: created.tournamentId,
        organizationId,
        descriptor,
        overrides: { format: 'round-robin' },
        customScripts: [notifyAttachment()],
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: created.tournamentId,
        number: 1,
        name: 'Stage',
        format: 'round-robin',
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      if (!fixture) throw new Error('Expected fixture');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      return { created, match };
    });
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      competition.recordResult(uow, {
        matchId: tournament.match.matchId,
        result: { sides: [], recordedAt: '2026-08-24T12:00:00.000Z' },
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );

    const blocked = await request({
      method: 'PUT',
      url: '/organizations/liga-orbital/tournaments/copa-script-lock/custom-scripts',
      token: 'organizer-org1',
      payload: { customScripts: [] },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.body).toContain('blocked after results');
  });

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

  it("lists the organization's active tournaments, excluding archived", async () => {
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

  it('creates a tournament with registration region, capacity, and check-in deadline', async () => {
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
        customScripts: [],
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

  it('creates a tournament instantiating a tournament profile and pre-creating declared stages', async () => {
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
        customScripts: [],
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

  it('rejects capacity reduction below current accepted entrant count', async () => {
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

  it('lists compatible tournament profiles for a descriptor and format', async () => {
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

  it('rejects tournament creation with undeclared fields and performs no write', async () => {
    const descriptor = footballDescriptor();
    const payload = {
      alias: 'rejected-undeclared-tournament',
      name: 'Rejected Undeclared Tournament',
      descriptorId: descriptor.descriptorId,
      descriptorVersion: descriptor.version,
      format: 'single-elimination',
      publicRegistration: true,
      requiresCheckIn: false,
      customScripts: [],
      unexpectedInjectedField: 'malicious-data',
    };

    const response = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
      payload,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload as string);
    expect(body.errorCode).toBe('bad-request');
    expect(body.message).toContain('property unexpectedInjectedField should not exist');

    const tournamentRepo = new TournamentRepository(scratch.db as Kysely<Database>);
    const found = await tournamentRepo.findByScopedAlias(
      'liga-orbital',
      'rejected-undeclared-tournament',
    );
    expect(found).toBeUndefined();
  });
});

function collectObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectObjectKeys);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectObjectKeys(nested)]);
}
