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
 * A recorded event carrying a declared `{ kind: 'tag' }` effect produces a
 * real `tag_facts` row, written in the same transaction as the event itself
 * (0073, task 3.1/3.2 and task 6.1) — the wiring `declared-tagging` never had
 * before this change, proven through the real HTTP event-recording path
 * `MatchControlController.recordEvent` now drives `tagFactsFrom` from.
 */
describe('tag facts inside the event-recording transaction (integration, 0073)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId: string;
  let matchId: string;
  let segmentId: string;
  let personId: string;
  let entrantId: string;
  const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('tag-facts');
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
        alias: 'liga-tags',
        name: 'Liga Tags',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: 'referee@tag-facts-test',
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
        email: 'referee@tag-facts-test',
        role: 'referee',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();

    // The 'goal' event definition gains a declared tag effect on top of the
    // base football fixture's own, rather than hand-duplicating the whole
    // definition — the only thing this test adds is the effect and the
    // discipline-level declaration it references.
    const base = footballDescriptor();
    const eventDefinitions = base.eventDefinitions.map((definition) =>
      definition.code === 'goal'
        ? {
            ...definition,
            effects: [
              ...(definition.effects ?? []),
              { kind: 'tag' as const, tagCode: 'captain', action: 'applied' as const },
            ],
          }
        : definition,
    );
    const descriptor = footballDescriptor({
      eventDefinitions,
      // `producedAt` is required for a fact to be produced at all —
      // `tagScopeFor` falls back to it when the tournament configures no
      // scope of its own, which this test (deliberately, per 0073's scope)
      // never does.
      tags: [{ code: 'captain', label: 'Captain', appliesTo: ['person'], producedAt: 'match' }],
    });

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const persons = new PersonRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-tags',
        name: 'Apertura Tags',
        descriptor,
        ...AUDIT,
      });

      const norte = await enrollment.createTeam(uow, { organizationId, name: 'Norte', ...AUDIT });
      const homeEntrant = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: norte.teamId },
        ...AUDIT,
      });
      entrantId = homeEntrant.entrantId;

      const { person } = await persons.register(uow, {
        organizationId,
        displayName: 'Jugador Tags',
        ...AUDIT,
      });
      personId = person.personId;
      await persons.enlist(uow, {
        personId,
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
        fixtures: [{ round: 1, homeEntrantId: entrantId }],
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
        .values({
          match_id: matchId,
          entrant_id: entrantId,
          person_ids: JSON.stringify([personId]),
          updated_at: new Date(),
        })
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

  it('a recorded event carrying a declared tag effect writes a real tag_facts row', async () => {
    const response = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: `/organizations/liga-tags/tournaments/apertura-tags/matches/${matchId}/events`,
      headers: {
        authorization: 'Bearer referee',
        'idempotency-key': '01890000-0000-7000-8000-0000000000b1',
      },
      payload: {
        definitionCode: 'goal',
        segmentId,
        occurredAt: Date.now(),
        side: entrantId,
        personId,
      },
    });
    expect(response.statusCode).toBe(201);

    const facts = await new TagRepository(scratch.db).factsFor({
      organizationId,
      code: 'captain',
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      code: 'captain',
      action: 'applied',
      actorGranularity: 'person',
      actorId: personId,
      competitionGranularity: 'match',
      competitionId: matchId,
    });
  });
});
