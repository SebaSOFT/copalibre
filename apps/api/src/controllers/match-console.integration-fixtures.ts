import { Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApiValidationPipe } from '../http/validation.js';
import { Test } from '@nestjs/testing';
import { footballDescriptor } from '@copalibre/domain';
import {
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
import { type AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { MatchControlController } from './match-control.controller.js';
import { applyApiPathPrefix } from '../http/api-path-prefix.js';

export const audit = { actor: 'user:seed', authorizationContext: 'seed' } as const;
export const subjects: Record<string, AuthenticatedSubject> = {
  referee: { subjectId: 'referee', scopes: ['copalibre.control'] },
  unassigned: { subjectId: 'unassigned', scopes: ['copalibre.control'] },
  inactive: { subjectId: 'inactive', scopes: ['copalibre.control'] },
  admin: { subjectId: 'admin', scopes: ['copalibre.control'] },
};

export function scriptParameter(
  actionId: string,
  name: string,
  type: 'simple_string' | 'simple_number',
  value: string | number,
  expression = false,
) {
  return {
    id: `${actionId}-${name}`,
    name,
    type,
    value,
    options: expression ? { expression: true } : {},
  };
}

export function scriptAction(
  id: string,
  type: string,
  parameters: readonly ReturnType<typeof scriptParameter>[],
) {
  return { id, type, options: {}, params: parameters };
}

export function eventHookAttachment(
  scriptId: string,
  actions: readonly ReturnType<typeof scriptAction>[],
) {
  return {
    hook: 'event.recorded',
    script: {
      id: scriptId,
      rules: [
        {
          id: `${scriptId}-rule`,
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions,
        },
      ],
    },
  };
}

export async function startMatchConsoleFixture() {
  let organizationId = '';
  let matchId = '';
  let segmentId = '';
  let stageId = '';
  let timerId = '';
  let rosteredPersonId = '';
  const entrantIds: string[] = [];

  async function seedRole(
    subjectId: string,
    role: 'admin' | 'referee',
    status: 'active' | 'inactive',
  ) {
    const principalId = newId();
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email: `${subjectId}@test`,
        oidc_subject_id: subjectId,
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
        email: `${subjectId}@test`,
        role,
        status,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      })
      .execute();
  }

  const scratch = await createMigratedDatabase('match-console');
  @Module({
    controllers: [MatchControlController],
    providers: [
      { provide: DATABASE, useValue: scratch.db },
      {
        provide: TokenVerifier,
        useValue: {
          verify: async (token: string): Promise<AuthenticatedSubject> => {
            const subject = subjects[token];
            if (!subject) throw new Error('unknown token');
            return { ...subject, organizationId };
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
  const app: INestApplication = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  applyApiPathPrefix(app);
  app.useGlobalPipes(createApiValidationPipe());
  await app.init();
  await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();

  const organization = await withTransaction(scratch.db, (uow) =>
    new OrganizationRepository(scratch.db).create(uow, {
      alias: 'liga-prueba',
      name: 'Liga Prueba',
      ...audit,
    }),
  );
  organizationId = organization.organizationId;
  await Promise.all([
    seedRole('referee', 'referee', 'active'),
    seedRole('unassigned', 'referee', 'active'),
    seedRole('inactive', 'referee', 'inactive'),
  ]);

  const tournaments = new TournamentRepository(scratch.db);
  const enrollment = new EnrollmentRepository(scratch.db);
  const competition = new CompetitionRepository(scratch.db);
  await withTransaction(scratch.db, async (uow) => {
    const descriptor = footballDescriptor({
      eventDefinitions: [
        ...footballDescriptor().eventDefinitions,
        {
          code: 'manual-penalty',
          label: 'Manual penalty',
          category: 'negative',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'side',
          payloadSchema: { type: 'object' },
          effects: [
            {
              kind: 'timed-penalty',
              durationSeconds: 300,
              affects: 'side',
              allowManualResolution: true,
            },
          ],
        },
        {
          code: 'outcome-decision',
          label: 'Outcome decision',
          category: 'neutral',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'none',
          payloadSchema: { type: 'object' },
          workflow: {
            kind: 'outcome-choice',
            options: [{ definitionCode: 'outcome-recorded', label: 'Outcome recorded' }],
          },
        },
        {
          code: 'outcome-recorded',
          label: 'Outcome recorded',
          category: 'neutral',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'none',
          payloadSchema: { type: 'object' },
        },
      ],
    });
    await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...audit });
    const tournament = await tournaments.create(uow, {
      organizationId,
      alias: 'apertura',
      name: 'Apertura',
      descriptor,
      ...audit,
    });
    const stage = await competition.createStageInTournament(uow, {
      tournamentId: tournament.tournamentId,
      number: 1,
      name: 'Regular',
      format: 'round-robin',
      organizationId,
      ...audit,
    });
    const entrants = await Promise.all(
      ['Norte', 'Sur'].map(async (name) => {
        const team = await enrollment.createTeam(uow, { organizationId, name, ...audit });
        return enrollment.registerEntrant(uow, {
          organizationId,
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          ...audit,
        });
      }),
    );
    entrantIds.push(...entrants.map((entrant) => entrant.entrantId));
    const [fixture] = await competition.createFixtures(uow, {
      stageId: stage.stageId,
      fixtures: [
        {
          round: 1,
          homeEntrantId: entrants[0]?.entrantId,
          awayEntrantId: entrants[1]?.entrantId,
        },
      ],
      organizationId,
      ...audit,
    });
    const match = await competition.createMatch(uow, {
      fixtureId: fixture?.fixtureId ?? '',
      number: 1,
      organizationId,
      ...audit,
    });
    stageId = stage.stageId;
    matchId = match.matchId;
    const segment = await competition.createSegment(uow, {
      matchId,
      type: 'half',
      number: 1,
      organizationId,
      ...audit,
    });
    segmentId = segment.segmentId;
    await competition.setSegmentState(uow, {
      segmentId,
      state: 'active',
      organizationId,
      ...audit,
    });
    await competition.applyCommand(uow, {
      matchId,
      command: 'start',
      status: 'in-progress',
      grantedBy: 'seed',
      organizationId,
      ...audit,
    });
    rosteredPersonId = newId();
    await uow.tx
      .insertInto('match_rosters')
      .values({
        match_id: matchId,
        entrant_id: entrants[0]?.entrantId ?? '',
        roster_members: JSON.stringify([
          { personId: rosteredPersonId, name: 'Player', onField: true },
        ]),
        updated_at: new Date(),
      })
      .execute();
    timerId = newId();
    await competition.appendEvent(uow, {
      event: {
        eventId: timerId,
        matchId,
        segmentId,
        definitionCode: 'manual-penalty',
        occurredAt: new Date().toISOString(),
        side: entrants[0]?.entrantId,
        payload: {},
      },
      sequence: 1,
      organizationId,
      ...audit,
    });
    await new MatchAssignmentRepository(scratch.db).appoint(uow, {
      organizationId,
      subjectId: 'referee',
      scope: { kind: 'match', matchId },
      capabilities: [
        'match.record-event',
        'match.control-clock',
        'match.resolve-timer',
        'match.finalize',
        'match.select-roster',
      ],
      ...audit,
    });
  });

  return {
    app,
    scratch,
    organizationId,
    stageId,
    matchId,
    segmentId,
    timerId,
    rosteredPersonId,
    entrantIds,
  };
}
