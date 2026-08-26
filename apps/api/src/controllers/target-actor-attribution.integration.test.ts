import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  OrganizationRepository,
  PersonRepository,
  StatisticRepository,
  TagRepository,
  TournamentRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { MatchControlController } from './match-control.controller.js';

/**
 * A single recorded event with a declared `awardTo`/`target: { payloadField }`
 * attribution snapshots `segmentElapsedSeconds`, writes a `tag_facts`
 * row for the payload-named person (not the primary actor), and updates a
 * live-cadence collector's total for that same payload-named person — all
 * inside the one event-recording transaction `MatchControlController.recordEvent`
 * drives, proven through the real HTTP path rather than the pure fold engine.
 */
describe('target attribution inside the event-recording transaction (integration)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId: string;
  let matchId: string;
  let segmentId: string;
  let entrantNorte: string;
  let entrantSur: string;
  let personScorer: string;
  let personAssist: string;
  const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('target-attribution');
    @Module({
      controllers: [MatchControlController],
      providers: [
        { provide: DATABASE, useValue: scratch.db },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              if (token !== 'referee') throw new Error('unknown token');
              return { subjectId: 'referee', scopes: ['copalibre.control'], organizationId };
            },
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class IntegrationModule {}
    const module = await Test.createTestingModule({ imports: [IntegrationModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-target',
        name: 'Liga Target',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: 'referee@target-attribution-test',
        oidc_subject_id: 'referee',
        name: null,
        picture: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    await scratch.db
      .insertInto('organization_role_assignments')
      .values({
        assignment_id: newId(),
        organization_id: organizationId,
        principal_id: principalId,
        email: 'referee@target-attribution-test',
        role: 'referee',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();

    // The 'goal' event already declares `assistedBy` in its payloadSchema
    // (football's real definition) — this fixture adds a targeted tag effect
    // and a payload-field-targeted live collector on top of it, the same way
    // tag-facts.integration.test.ts adds only what it needs.
    const base = footballDescriptor();
    const eventDefinitions = base.eventDefinitions.map((definition) =>
      definition.code === 'goal'
        ? {
            ...definition,
            effects: [
              ...(definition.effects ?? []),
              {
                kind: 'tag' as const,
                tagCode: 'credited-with-assist',
                action: 'applied' as const,
                target: { payloadField: 'assistedBy' },
              },
            ],
          }
        : definition,
    );
    const descriptor = footballDescriptor({
      eventDefinitions,
      tags: [
        {
          code: 'credited-with-assist',
          label: 'Credited with assist',
          appliesTo: ['person'],
          producedAt: 'match',
        },
      ],
      collectors: [
        {
          code: 'assists-live',
          label: 'Assists (live)',
          source: {
            kind: 'event',
            definitionCodes: ['goal'],
            actorSource: { payloadField: 'assistedBy' },
          },
          measure: { kind: 'count' },
          granularity: { actor: 'person', competition: 'match' },
          cadence: { kind: 'live' },
        },
      ],
    });

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const persons = new PersonRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-target',
        name: 'Apertura Target',
        descriptor,
        ...AUDIT,
      });

      const norte = await enrollment.createTeam(uow, { organizationId, name: 'Norte', ...AUDIT });
      const sur = await enrollment.createTeam(uow, { organizationId, name: 'Sur', ...AUDIT });
      const [homeEntrant, awayEntrant] = await Promise.all([
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: norte.teamId },
          ...AUDIT,
        }),
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: sur.teamId },
          ...AUDIT,
        }),
      ]);
      entrantNorte = homeEntrant.entrantId;
      entrantSur = awayEntrant.entrantId;

      const { person: scorer } = await persons.register(uow, {
        organizationId,
        displayName: 'Goleador',
        ...AUDIT,
      });
      personScorer = scorer.personId;
      const { person: assist } = await persons.register(uow, {
        organizationId,
        displayName: 'Asistidor',
        ...AUDIT,
      });
      personAssist = assist.personId;
      await persons.enlist(uow, {
        personId: personScorer,
        teamId: norte.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      await persons.enlist(uow, {
        personId: personAssist,
        teamId: norte.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });

      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: entrantNorte, awayEntrantId: entrantSur }],
        organizationId,
        ...AUDIT,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      matchId = match.matchId;

      const segment = await competition.createSegment(uow, {
        matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      segmentId = segment.segmentId;
      await competition.setSegmentState(uow, {
        segmentId,
        state: 'active',
        organizationId,
        ...AUDIT,
      });
      await competition.applyCommand(uow, {
        matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...AUDIT,
      });
      await uow.tx
        .insertInto('match_rosters')
        .values([
          {
            match_id: matchId,
            entrant_id: entrantNorte,
            roster_members: JSON.stringify([
              { personId: personScorer, name: 'Goleador', onField: true },
              { personId: personAssist, name: 'Asistidor', onField: true },
            ]),
            updated_at: new Date(),
          },
          {
            match_id: matchId,
            entrant_id: entrantSur,
            roster_members: JSON.stringify([]),
            updated_at: new Date(),
          },
        ])
        .execute();
      await new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId: 'referee',
        scope: { kind: 'match', matchId },
        capabilities: ['match.record-event'],
        ...AUDIT,
      });
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  it('snapshots segmentElapsedSeconds, tags the payload-named assist provider, and updates their live total — all from one request', async () => {
    const response = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: `/organizations/liga-target/tournaments/apertura-target/matches/${matchId}/events`,
      headers: {
        authorization: 'Bearer referee',
        'idempotency-key': '01890000-0000-7000-8000-0000000000c1',
      },
      payload: {
        definitionCode: 'goal',
        segmentId,
        occurredAt: Date.now(),
        side: entrantNorte,
        personId: personScorer,
        payload: { assistedBy: personAssist },
      },
    });
    expect(response.statusCode).toBe(201);

    const persisted = await scratch.db
      .selectFrom('match_events')
      .select(['segment_elapsed_seconds', 'person_id'])
      .where('match_id', '=', matchId)
      .executeTakeFirstOrThrow();
    // A timed segment (football's 'half') always has a clock to snapshot,
    // even freshly started at zero — the point is the column is populated,
    // not any specific elapsed value.
    expect(typeof persisted.segment_elapsed_seconds).toBe('number');
    expect(persisted.person_id).toBe(personScorer);

    const facts = await new TagRepository(scratch.db).factsFor({
      organizationId,
      code: 'credited-with-assist',
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      code: 'credited-with-assist',
      action: 'applied',
      actorGranularity: 'person',
      // The assist provider, not the scorer who recorded the event.
      actorId: personAssist,
      competitionGranularity: 'match',
      competitionId: matchId,
    });

    const statistics = new StatisticRepository(scratch.db);
    const assistsLive = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'assists-live',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );
    expect(assistsLive).toEqual([
      { actorId: personAssist, competitionId: matchId, value: 1, samples: 1 },
    ]);
  });
});
