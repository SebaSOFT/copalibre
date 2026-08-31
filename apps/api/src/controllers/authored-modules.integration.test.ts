import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import { loadDefaultModuleCatalogue } from '@copalibre/module-catalogue';
import {
  CompetitionRepository,
  EnrollmentRepository,
  InstalledModuleRepository,
  OrganizationRepository,
  PersonRepository,
  TournamentProfileRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { seedModuleCatalogue } from '../../../seed/src/catalogue-seeder.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import { SUPER_ADMIN_SCOPE } from '../auth/access-requirement.js';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { ApiExceptionFilter } from '../http/error-contract.js';
import { createApiValidationPipe } from '../http/validation.js';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import { AuthoredModulesController } from './authored-modules.controller.js';
import { TournamentsController } from './tournaments.controller.js';

const AUDIT = { actor: 'user:authored-modules-test', authorizationContext: 'scope:test' };
const ATTRIBUTION = { author: 'Test Author', licence: 'AGPL-3.0-only' };

function disciplineDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    alias: 'authored-test-sport',
    version: '1.0.0',
    name: 'Authored Test Sport',
    attribution: ATTRIBUTION,
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 20 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [{ code: 'points', label: 'Points', aggregation: 'sum' }],
    scoringInputs: [],
    availableFormats: ['round-robin', 'single-elimination'],
    notificationRuleCapabilities: [],
    winCondition: { id: 'wc', rules: [] },
    defaults: {},
    fieldPolicies: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
      'registration.publicOpen': { permission: { kind: 'replaced' }, mutationClass: 'safe' },
      'registration.requiresCheckIn': {
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      },
      'registration.capacity': {
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      },
    },
    ...overrides,
  };
}

function profileDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    alias: 'authored-test-cup',
    version: '1.0.0',
    name: 'Authored Test Cup',
    attribution: ATTRIBUTION,
    requires: [],
    stages: [
      { number: 1, name: 'Groups', format: 'round-robin' },
      { number: 2, name: 'Final', format: 'single-elimination' },
    ],
    points: { win: 3, draw: 1, loss: 0 },
    tiebreak: [],
    ...overrides,
  };
}

/**
 * The HTTP path for authoring a discipline/profile through the control-panel
 * builder (openspec 0164) — proving an authored module is an ordinary one by
 * installing it and then exercising the ordinary tournament/match path
 * against it, exactly as `admin-modules.integration.test.ts` does for a
 * curated module.
 */
describe('AuthoredModulesController (integration)', () => {
  let authoredApp: INestApplication;
  let tournamentApp: INestApplication;
  let scratch: ScratchDatabase;
  let organizationId: string;
  let organizationAlias: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('authored-modules-controller');
    const db = scratch.db;
    const storage = createObjectStorageAdapter(
      objectStorageConfigFromEnv({ ...process.env, DATABASE_URL: scratch.connectionString }),
    );

    organizationAlias = 'liga-authored';
    const organization = await withTransaction(db, (uow) =>
      new OrganizationRepository(db).create(uow, {
        alias: organizationAlias,
        name: 'Liga Authored',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const authoredSubjects: Record<string, AuthenticatedSubject> = {
      'super-admin': { subjectId: 'oidc-super-admin', scopes: [SUPER_ADMIN_SCOPE] },
      'org-admin': { subjectId: 'oidc-org-admin', scopes: ['copalibre.control'] },
    };

    @Module({
      controllers: [AuthoredModulesController],
      providers: [
        { provide: DATABASE, useValue: db },
        { provide: OBJECT_STORAGE, useValue: storage },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              const subject = authoredSubjects[token];
              if (!subject) throw new Error('unknown token');
              return subject;
            },
          },
        },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: OrganizationAccessGuard },
        Reflector,
      ],
    })
    class AuthoredModulesTestModule {}

    const authoredModuleRef = await Test.createTestingModule({
      imports: [AuthoredModulesTestModule],
    }).compile();
    authoredApp = authoredModuleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    authoredApp.useGlobalPipes(createApiValidationPipe());
    await authoredApp.init();
    await (authoredApp as NestFastifyApplication).getHttpAdapter().getInstance().ready();

    // A second, separately-guarded app for tournament creation — mirrors
    // `tournaments.integration.test.ts`'s own harness exactly (no
    // `OrganizationAccessGuard`; `TournamentsController` enforces
    // organization scope itself via `enforcePolicy`), sharing the same
    // database so a module installed through `authoredApp` is visible here.
    const tournamentSubjects: Record<string, AuthenticatedSubject> = {
      'org-admin': { subjectId: 'oidc-org-admin', organizationId, scopes: ['copalibre.control'] },
    };

    @Module({
      controllers: [TournamentsController],
      providers: [
        { provide: DATABASE, useValue: db },
        {
          provide: TokenVerifier,
          useValue: {
            verify: async (token: string): Promise<AuthenticatedSubject> => {
              const subject = tournamentSubjects[token];
              if (!subject) throw new Error('unknown token');
              return subject;
            },
          },
        },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        Reflector,
      ],
    })
    class TournamentTestModule {}

    const tournamentModuleRef = await Test.createTestingModule({
      imports: [TournamentTestModule],
    }).compile();
    tournamentApp = tournamentModuleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    tournamentApp.useGlobalPipes(createApiValidationPipe());
    await tournamentApp.init();
    await (tournamentApp as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await authoredApp?.close();
    await tournamentApp?.close();
    await scratch?.drop();
  });

  function inject(
    token: string | undefined,
    method: 'GET' | 'POST',
    url: string,
    payload: unknown,
  ) {
    return (authoredApp as NestFastifyApplication).inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as never,
    });
  }

  function injectTournament(token: string, url: string, payload: unknown) {
    return (tournamentApp as NestFastifyApplication).inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as never,
    });
  }

  describe('authorization', () => {
    it('refuses a non-super-admin caller validating a document', async () => {
      const response = await inject('org-admin', 'POST', '/admin/authored-modules/validate', {
        kind: 'discipline',
        document: disciplineDocument(),
      });
      expect(response.statusCode).toBe(403);
    });

    it('refuses with no bearer token at all', async () => {
      const response = await inject(undefined, 'POST', '/admin/authored-modules/validate', {
        kind: 'discipline',
        document: disciplineDocument(),
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('validate', () => {
    it('accepts a well-formed discipline document without installing it', async () => {
      const response = await inject('super-admin', 'POST', '/admin/authored-modules/validate', {
        kind: 'discipline',
        document: disciplineDocument({ alias: 'authored-validate-only-sport' }),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true, failures: [] });

      const installed = await new InstalledModuleRepository(scratch.db).findByAlias(
        'authored-validate-only-sport',
      );
      expect(installed).toHaveLength(0);
    });

    it('refuses a statistic with no aggregation mode, naming its own path', async () => {
      const response = await inject('super-admin', 'POST', '/admin/authored-modules/validate', {
        kind: 'discipline',
        document: disciplineDocument({
          alias: 'authored-bad-statistic-sport',
          statistics: [{ code: 'points', label: 'Points' }],
        }),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        ok: boolean;
        failures: { stage: string; field?: string }[];
      };
      expect(body.ok).toBe(false);
      expect(body.failures.some((failure) => failure.stage === 'artifact')).toBe(true);
    });

    it('refuses a collector referencing an event the discipline does not declare, naming its own path', async () => {
      const response = await inject('super-admin', 'POST', '/admin/authored-modules/validate', {
        kind: 'discipline',
        document: disciplineDocument({
          alias: 'authored-bad-collector-sport',
          collectors: [
            {
              code: 'goal-count',
              label: 'Goals',
              source: { kind: 'event', definitionCodes: ['undeclared-goal-event'] },
              measure: { kind: 'count' },
              granularity: { actor: 'person', competition: 'match' },
            },
          ],
        }),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { ok: boolean; failures: { stage: string }[] };
      expect(body.ok).toBe(false);
      expect(body.failures.some((failure) => failure.stage === 'collectors')).toBe(true);
    });

    it('refuses an alias the bundled catalogue reserves, naming the reservation', async () => {
      const response = await inject('super-admin', 'POST', '/admin/authored-modules/validate', {
        kind: 'discipline',
        document: disciplineDocument({ alias: 'football' }),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        ok: boolean;
        failures: { stage: string; message: string }[];
      };
      expect(body.ok).toBe(false);
      const reserved = body.failures.find((failure) => failure.stage === 'reserved-alias');
      expect(reserved?.message).toContain('reserved');
    });

    it('refuses a name with no English value', async () => {
      const response = await inject('super-admin', 'POST', '/admin/authored-modules/validate', {
        kind: 'discipline',
        document: disciplineDocument({
          alias: 'authored-no-english-sport',
          name: { es: 'Solo Español' },
        }),
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as { ok: boolean }).ok).toBe(false);
    });

    it('accepts a partially translated name (English plus one other language)', async () => {
      const response = await inject('super-admin', 'POST', '/admin/authored-modules/validate', {
        kind: 'discipline',
        document: disciplineDocument({
          alias: 'authored-partial-translation-sport',
          name: { en: 'Authored Sport', es: 'Deporte Autoría' },
        }),
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as { ok: boolean }).ok).toBe(true);
    });
  });

  describe('install, then create a tournament and play a match', () => {
    it('installs an authored discipline as an ordinary, source-kind "authored" module', async () => {
      const install = await inject('super-admin', 'POST', '/admin/authored-modules', {
        kind: 'discipline',
        document: disciplineDocument(),
      });
      expect(install.statusCode).toBe(201);
      expect(install.json()).toMatchObject({
        kind: 'discipline',
        alias: 'authored-test-sport',
        version: '1.0.0',
      });

      const installed = await new InstalledModuleRepository(scratch.db).findByAlias(
        'authored-test-sport',
      );
      expect(installed).toHaveLength(1);
      expect(installed[0]?.sourceKind).toBe('authored');
    });

    it('refuses installing a malformed document, carrying the same path-bearing failures', async () => {
      const install = await inject('super-admin', 'POST', '/admin/authored-modules', {
        kind: 'discipline',
        document: disciplineDocument({
          alias: 'authored-bad-install-sport',
          statistics: [{ code: 'points', label: 'Points' }],
        }),
      });
      expect(install.statusCode).toBe(400);
      const body = install.json() as { failures: { stage: string }[] };
      expect(body.failures.some((failure) => failure.stage === 'artifact')).toBe(true);

      const installed = await new InstalledModuleRepository(scratch.db).findByAlias(
        'authored-bad-install-sport',
      );
      expect(installed).toHaveLength(0);
    });

    it('installs a profile validated against the installed discipline, pre-creating both stages on tournament creation', async () => {
      const install = await inject('super-admin', 'POST', '/admin/authored-modules', {
        kind: 'tournament-profile',
        document: profileDocument(),
        disciplineAlias: 'authored-test-sport',
      });
      expect(install.statusCode).toBe(201);
      expect(install.json()).toMatchObject({
        kind: 'tournament-profile',
        alias: 'authored-test-cup',
        version: '1.0.0',
      });

      const descriptor = await new TournamentRepository(scratch.db).findDescriptorByAlias(
        'authored-test-sport',
        '1.0.0',
      );
      const profile = await new TournamentProfileRepository(scratch.db).findByAlias(
        'authored-test-cup',
        '1.0.0',
      );
      expect(descriptor).toBeDefined();
      expect(profile).toBeDefined();

      const created = await injectTournament(
        'org-admin',
        `/organizations/${organizationAlias}/tournaments`,
        {
          alias: 'copa-authored',
          name: 'Copa Authored',
          descriptorId: descriptor?.descriptorId,
          descriptorVersion: descriptor?.version,
          format: 'round-robin',
          publicRegistration: true,
          requiresCheckIn: false,
          capacity: 16,
          profileId: profile?.profileId,
          profileVersion: profile?.version,
          customScripts: [],
        },
      );
      expect(created.statusCode).toBe(201);
      const tournament = created.json() as { tournamentId: string };

      const competition = new CompetitionRepository(scratch.db);
      const stages = await competition.listStagesOfTournament(tournament.tournamentId);
      expect(stages.map((stage) => stage.format).sort()).toEqual(
        ['round-robin', 'single-elimination'].sort(),
      );
    });

    it('refuses a profile stage format the named discipline does not declare, naming the discipline and its declared formats', async () => {
      const response = await inject('super-admin', 'POST', '/admin/authored-modules/validate', {
        kind: 'tournament-profile',
        document: profileDocument({
          alias: 'authored-unsupported-format-cup',
          stages: [{ number: 1, name: 'Playoffs', format: 'league' }],
        }),
        disciplineAlias: 'authored-test-sport',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        ok: boolean;
        failures: { stage: string; message: string }[];
      };
      expect(body.ok).toBe(false);
      const formatFailure = body.failures.find((failure) => failure.stage === 'profile-format');
      expect(formatFailure?.message).toContain('authored-test-sport');
    });

    it('plays a match through an authored discipline exactly as it would an ordinary one', async () => {
      const descriptor = await new TournamentRepository(scratch.db).findDescriptorByAlias(
        'authored-test-sport',
        '1.0.0',
      );
      if (!descriptor) throw new Error('Expected the authored discipline to be installed');

      const tournaments = new TournamentRepository(scratch.db);
      const enrollment = new EnrollmentRepository(scratch.db);
      const persons = new PersonRepository(scratch.db);
      const competition = new CompetitionRepository(scratch.db);

      await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
        const tournament = await tournaments.create(uow, {
          organizationId,
          alias: 'apertura-authored',
          name: 'Apertura Authored',
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
        const { person } = await persons.register(uow, {
          organizationId,
          displayName: 'Jugadora Authored',
          ...AUDIT,
        });
        await persons.enlist(uow, {
          personId: person.personId,
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
          fixtures: [{ round: 1, homeEntrantId: homeEntrant.entrantId }],
          organizationId,
          ...AUDIT,
        });
        const match = await competition.createMatch(uow, {
          fixtureId: fixture?.fixtureId ?? '',
          number: 1,
          organizationId,
          ...AUDIT,
        });
        await competition.recordResult(uow, {
          matchId: match.matchId,
          result: {
            sides: [{ entrantId: homeEntrant.entrantId, statistics: { points: 3 } }],
            recordedAt: new Date().toISOString(),
          },
          organizationId,
          ...AUDIT,
        });

        const finalized = await competition.findMatch(match.matchId, uow);
        expect(finalized?.status).toBe('finalized');
      });
    });
  });

  describe('revision and retirement protection', () => {
    it('refuses altering a version a started tournament references, then accepts a revision into a new version', async () => {
      const tournaments = new TournamentRepository(scratch.db);
      const descriptor = await tournaments.findDescriptorByAlias('authored-test-sport', '1.0.0');
      if (!descriptor) throw new Error('Expected the authored discipline to be installed');

      const { tournamentId } = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        tournaments.create(uow, {
          organizationId,
          alias: 'started-authored-cup',
          name: 'Started Authored Cup',
          descriptor,
          ...AUDIT,
        }),
      );
      await scratch.db
        .updateTable('tournaments')
        .set({ status: 'started' })
        .where('tournament_id', '=', tournamentId)
        .execute();

      const reinstall = await inject('super-admin', 'POST', '/admin/authored-modules', {
        kind: 'discipline',
        document: disciplineDocument(),
      });
      expect(reinstall.statusCode).toBe(409);
      expect((reinstall.json() as { message: string }).message).toContain('started-authored-cup');

      const revision = await inject('super-admin', 'POST', '/admin/authored-modules', {
        kind: 'discipline',
        document: disciplineDocument({ version: '1.1.0' }),
      });
      expect(revision.statusCode).toBe(201);

      const startedTournament = await tournaments.findDescriptor(descriptor.descriptorId, '1.0.0');
      expect(startedTournament?.version).toBe('1.0.0');
      const versions = await tournaments.findDescriptorVersionsByAlias('authored-test-sport');
      expect(versions.map((version) => version.version).sort()).toEqual(['1.0.0', '1.1.0']);
    });
  });

  describe('coexistence with the bundled catalogue', () => {
    it('leaves an authored module untouched when the bundled catalogue is re-seeded', async () => {
      const before = await new InstalledModuleRepository(scratch.db).findByAlias(
        'authored-test-sport',
      );
      expect(before.length).toBeGreaterThan(0);

      const storage = createObjectStorageAdapter(
        objectStorageConfigFromEnv({ ...process.env, DATABASE_URL: scratch.connectionString }),
      );
      const catalogue = await loadDefaultModuleCatalogue();
      await seedModuleCatalogue(scratch.db, catalogue, storage);

      const after = await new InstalledModuleRepository(scratch.db).findByAlias(
        'authored-test-sport',
      );
      expect(after).toEqual(before);
    });
  });

  describe('submit', () => {
    it('404s contributing an authored module that is not installed', async () => {
      const response = await inject('super-admin', 'POST', '/admin/authored-modules/submit', {
        kind: 'discipline',
        alias: 'no-such-authored-alias',
        version: '1.0.0',
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
