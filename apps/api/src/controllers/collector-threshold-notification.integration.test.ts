import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { compileEffectiveRuleset, footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRecordRepository,
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  OrganizationRepository,
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
 * End-to-end coverage of 0074's wiring: `collectorThresholdRules` declared on
 * a compiled ruleset's config, evaluated inside `MatchControlController`'s
 * real event-recording transaction, over a stage-scoped baseline sourced from
 * real match rows — not the pure `evaluateCollectorThreshold` function on its
 * own (already covered in `packages/rules`).
 */
describe('collector-threshold notifications across a stage (integration, 0074)', () => {
  let app: INestApplication;
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';
  let personId = '';
  const stage1MatchIds: string[] = [];
  const stage1SegmentIds: string[] = [];
  let stage2MatchId = '';
  let stage2SegmentId = '';
  const base = (matchId: string) =>
    `/organizations/liga-prueba-ct/tournaments/apertura-ct/matches/${matchId}`;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('collector-threshold');
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

    const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-prueba-ct',
        name: 'Liga Prueba CT',
        ...audit,
      }),
    );
    organizationId = organization.organizationId;

    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: 'referee@test',
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
        email: 'referee@test',
        role: 'referee',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();

    const descriptor = footballDescriptor({
      eventDefinitions: [
        ...footballDescriptor().eventDefinitions,
        {
          code: 'blue-card',
          label: 'Blue card',
          category: 'negative',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'person',
          payloadSchema: { type: 'object' },
        },
      ],
      collectors: [
        {
          code: 'blue-cards',
          label: 'Blue cards',
          source: { kind: 'event', definitionCodes: ['blue-card'] },
          measure: { kind: 'count' },
          granularity: { actor: 'person', competition: 'stage' },
        },
      ],
      defaults: {
        ...footballDescriptor().defaults,
        collectorThresholdRules: [
          {
            id: 'three-blue-cards',
            version: 1,
            collectorCode: 'blue-cards',
            actorGranularity: 'person',
            threshold: { comparator: '>=', value: 3 },
            window: 'since-last-consequence',
            action: {
              severity: 'warning',
              titleTemplate: 'Three blue cards',
              messageTemplate: '{{scopeKey}} reached {{window}} blue cards this stage',
              targetRole: 'operator',
            },
          },
        ],
      },
    });

    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura-ct',
        name: 'Apertura CT',
        descriptor,
        ...audit,
      });

      const compiled = compileEffectiveRuleset(descriptor);
      if (!compiled.ok) throw new Error('descriptor failed to compile in test setup');
      await new CompetitionRecordRepository(scratch.db).saveCompiledRuleset(uow, {
        tournamentId: tournament.tournamentId,
        ruleset: compiled.value,
        organizationId,
        ...audit,
      });

      const norte = await enrollment.createTeam(uow, { organizationId, name: 'Norte', ...audit });
      const sur = await enrollment.createTeam(uow, { organizationId, name: 'Sur', ...audit });
      const [homeEntrant, awayEntrant] = await Promise.all([
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: norte.teamId },
          ...audit,
        }),
        enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: sur.teamId },
          ...audit,
        }),
      ]);

      personId = newId();

      const stage1 = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular',
        format: 'round-robin',
        organizationId,
        ...audit,
      });

      for (let round = 1; round <= 3; round += 1) {
        const [fixture] = await competition.createFixtures(uow, {
          stageId: stage1.stageId,
          fixtures: [
            {
              round,
              homeEntrantId: homeEntrant.entrantId,
              awayEntrantId: awayEntrant.entrantId,
            },
          ],
          organizationId,
          ...audit,
        });
        const match = await competition.createMatch(uow, {
          fixtureId: fixture?.fixtureId ?? '',
          number: round,
          organizationId,
          ...audit,
        });
        const segment = await competition.createSegment(uow, {
          matchId: match.matchId,
          type: 'half',
          number: 1,
          organizationId,
          ...audit,
        });
        await competition.setSegmentState(uow, {
          segmentId: segment.segmentId,
          state: 'active',
          organizationId,
          ...audit,
        });
        await competition.applyCommand(uow, {
          matchId: match.matchId,
          command: 'start',
          status: 'in-progress',
          grantedBy: 'seed',
          organizationId,
          ...audit,
        });
        await uow.tx
          .insertInto('match_rosters')
          .values({
            match_id: match.matchId,
            entrant_id: homeEntrant.entrantId,
            roster_members: JSON.stringify([{ personId, name: 'Player', onField: true }]),
            updated_at: new Date(),
          })
          .execute();
        await new MatchAssignmentRepository(scratch.db).appoint(uow, {
          organizationId,
          subjectId: 'referee',
          scope: { kind: 'match', matchId: match.matchId },
          capabilities: ['match.record-event'],
          ...audit,
        });
        stage1MatchIds.push(match.matchId);
        stage1SegmentIds.push(segment.segmentId);
      }

      const stage2 = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Segunda',
        format: 'round-robin',
        organizationId,
        ...audit,
      });
      const [stage2Fixture] = await competition.createFixtures(uow, {
        stageId: stage2.stageId,
        fixtures: [
          { round: 1, homeEntrantId: homeEntrant.entrantId, awayEntrantId: awayEntrant.entrantId },
        ],
        organizationId,
        ...audit,
      });
      const stage2Match = await competition.createMatch(uow, {
        fixtureId: stage2Fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...audit,
      });
      const stage2Segment = await competition.createSegment(uow, {
        matchId: stage2Match.matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      });
      await competition.setSegmentState(uow, {
        segmentId: stage2Segment.segmentId,
        state: 'active',
        organizationId,
        ...audit,
      });
      await competition.applyCommand(uow, {
        matchId: stage2Match.matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'seed',
        organizationId,
        ...audit,
      });
      await uow.tx
        .insertInto('match_rosters')
        .values({
          match_id: stage2Match.matchId,
          entrant_id: homeEntrant.entrantId,
          roster_members: JSON.stringify([{ personId, name: 'Player', onField: true }]),
          updated_at: new Date(),
        })
        .execute();
      await new MatchAssignmentRepository(scratch.db).appoint(uow, {
        organizationId,
        subjectId: 'referee',
        scope: { kind: 'match', matchId: stage2Match.matchId },
        capabilities: ['match.record-event'],
        ...audit,
      });
      stage2MatchId = stage2Match.matchId;
      stage2SegmentId = stage2Segment.segmentId;
    });
  });

  afterAll(async () => {
    await app?.close();
    await scratch?.drop();
  });

  function recordBlueCard(matchId: string, segmentId: string) {
    return (app as NestFastifyApplication).inject({
      method: 'POST',
      url: `${base(matchId)}/events`,
      headers: {
        authorization: 'Bearer referee',
        // A fresh key per call (0123: `recordEvent` now checks one) — the
        // fourth blue card in the same match is a genuinely distinct event,
        // not a retry of an earlier one, so it must not collide with it.
        'idempotency-key': crypto.randomUUID(),
      },
      payload: {
        definitionCode: 'blue-card',
        segmentId,
        occurredAt: Date.now(),
        personId,
      },
    });
  }

  it('fires exactly once on the third blue card across three different matches in a stage, and does not re-fire on a fourth', async () => {
    const first = await recordBlueCard(stage1MatchIds[0] ?? '', stage1SegmentIds[0] ?? '');
    expect(first.statusCode).toBe(201);
    expect(first.json().notifications).toEqual([]);

    const second = await recordBlueCard(stage1MatchIds[1] ?? '', stage1SegmentIds[1] ?? '');
    expect(second.statusCode).toBe(201);
    expect(second.json().notifications).toEqual([]);

    const third = await recordBlueCard(stage1MatchIds[2] ?? '', stage1SegmentIds[2] ?? '');
    expect(third.statusCode).toBe(201);
    expect(third.json().notifications).toHaveLength(1);

    // A fourth card in the same stage: the window restarted at the third
    // firing, so this one alone does not cross it again.
    const fourth = await recordBlueCard(stage1MatchIds[2] ?? '', stage1SegmentIds[2] ?? '');
    expect(fourth.statusCode).toBe(201);
    expect(fourth.json().notifications).toEqual([]);
  });

  it('does not carry a stage-1 total into a different stage', async () => {
    // By this point the same player already has four blue cards recorded in
    // stage 1. A card in stage 2's own (first) match must be evaluated
    // against stage 2's own baseline, not stage 1's.
    const response = await recordBlueCard(stage2MatchId, stage2SegmentId);
    expect(response.statusCode).toBe(201);
    expect(response.json().notifications).toEqual([]);
  });
});
