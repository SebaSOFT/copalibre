import type { INestApplication } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { footballDescriptor } from '@copalibre/domain';
import { TournamentRepository, withTransaction, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { HealthController } from '../health.controller.js';
import { buildTestApp } from './test-support/integration-harness.js';
import { OrganizationsController } from './organizations.controller.js';
import { TournamentsController } from './tournaments.controller.js';

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([
    HealthController,
    OrganizationsController,
    TournamentsController,
  ]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('CORS policy', () => {
  it('allows requests from the configured COPALIBRE_APP_URL origin', async () => {
    const response = await (app as NestFastifyApplication).inject({
      method: 'OPTIONS',
      url: '/_health',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'GET',
      },
    });
    expect(response.headers['access-control-allow-origin']).toEqual('https://app.example.com');
  });

  it('rejects requests from unknown origins by returning only the permitted origin', async () => {
    const response = await (app as NestFastifyApplication).inject({
      method: 'OPTIONS',
      url: '/_health',
      headers: {
        origin: 'https://attacker.example.com',
        'access-control-request-method': 'GET',
      },
    });
    expect(response.headers['access-control-allow-origin']).toEqual('https://app.example.com');
  });
});

describe('public-read plane', () => {
  it('serves the liveness probe anonymously', async () => {
    const response = await request({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ role: 'api' });
  });

  it('reads an organization by alias with no token', async () => {
    const response = await request({ method: 'GET', url: '/organizations/liga-orbital' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ alias: 'liga-orbital', name: 'Liga Orbital' });
  });

  it('lists public organizations with at least one published tournament', async () => {
    // Initially no published tournaments -> empty list
    const initial = await request({ method: 'GET', url: '/organizations' });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual([]);

    // Create a draft-only organization
    await request({
      method: 'POST',
      url: '/organizations',
      token: 'super-admin',
      payload: { alias: 'draft-only-org', name: 'Draft Only Org' },
    });

    // Create and publish a tournament in liga-orbital
    const descriptor = footballDescriptor();
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new TournamentRepository(scratch.db).saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
      payload: {
        alias: 'torneo-publicado',
        name: 'Torneo Publicado',
        descriptorId: descriptor.descriptorId,
        descriptorVersion: descriptor.version,
        format: 'round-robin',
        publicRegistration: true,
        requiresCheckIn: false,
        customScripts: [],
      },
    });
    await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/torneo-publicado/publish',
      token: 'organizer-org1',
    });

    const listing = await request({ method: 'GET', url: '/organizations' });
    expect(listing.statusCode).toBe(200);
    const orgs = listing.json();
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({
      organizationId,
      alias: 'liga-orbital',
      name: 'Liga Orbital',
      primaryLanguage: expect.any(String),
      timezone: expect.any(String),
    });
  });

  it('404s an unknown alias', async () => {
    const response = await request({ method: 'GET', url: '/organizations/no-such-org' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      statusCode: 404,
      errorCode: 'organization-not-found',
      message: expect.any(String),
    });
  });
});

describe('admin-control plane', () => {
  it('401s with no token', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations',
      payload: { alias: 'nueva-liga', name: 'Nueva Liga' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('401s with an unverifiable token', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations',
      token: 'forged',
      payload: { alias: 'nueva-liga', name: 'Nueva Liga' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('403s a verified token that lacks the control scope', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations',
      token: 'participant-org1',
      payload: { alias: 'nueva-liga', name: 'Nueva Liga' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('creates an organization with a super-admin-scoped token', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations',
      token: 'super-admin',
      payload: { alias: 'club-cometa', name: 'Club Cometa' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ alias: 'club-cometa' });
  });

  it('400s an organization created without a name, before reaching the controller', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations',
      token: 'super-admin',
      payload: { alias: 'club-sin-nombre' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an extra undocumented property with 400 when creating an organization', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations',
      token: 'super-admin',
      payload: {
        alias: 'club-propiedad-extra',
        name: 'Club Propiedad Extra',
        unexpectedField: 'x',
      },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.errorCode).toBe('bad-request');
    expect(body.message).toContain('property unexpectedField should not exist');
  });

  it('defaults a new organization to Spanish and UTC when not specified', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations',
      token: 'super-admin',
      payload: { alias: 'club-default-locale', name: 'Club Default Locale' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ primaryLanguage: 'es', timezone: 'UTC' });
  });

  it('creates an organization with an explicit primary language and timezone', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations',
      token: 'super-admin',
      payload: {
        alias: 'club-explicit-locale',
        name: 'Club Explicit Locale',
        primaryLanguage: 'de',
        timezone: 'Europe/Berlin',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ primaryLanguage: 'de', timezone: 'Europe/Berlin' });
  });

  it('409s an organization created with an unsupported primary language', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations',
      token: 'super-admin',
      payload: { alias: 'club-bad-locale', name: 'Club Bad Locale', primaryLanguage: 'ja' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('403s an organizer scoped to a different organization', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org2',
      payload: {
        alias: 'copa-ajena',
        name: 'Copa Ajena',
        descriptorId: '01890000-0000-7000-8000-000000000001',
        descriptorVersion: '1',
        format: 'round-robin',
        publicRegistration: false,
        requiresCheckIn: false,
        customScripts: [],
      },
    });
    // Cross-organization access is denied by policy, before the descriptor
    // lookup would have rejected it — proving policy runs first.
    expect(response.statusCode).toBe(403);
  });

  it('400s a tournament referencing an unknown descriptor', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments',
      token: 'organizer-org1',
      payload: {
        alias: 'copa-sin-disciplina',
        name: 'Copa Sin Disciplina',
        descriptorId: '01890000-0000-7000-8000-0000000000ff',
        descriptorVersion: 9,
        format: 'round-robin',
        publicRegistration: false,
        requiresCheckIn: false,
        customScripts: [],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('creates a tournament ruleset pinned to the selected descriptor version', async () => {
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
        alias: 'copa-versionada',
        name: 'Copa Versionada',
        descriptorId: descriptor.descriptorId,
        descriptorVersion: descriptor.version,
        format: 'round-robin',
        publicRegistration: true,
        requiresCheckIn: true,
        customScripts: [],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().rulesetId).toBeDefined();

    const created = await tournaments.findByScopedAlias('liga-orbital', 'copa-versionada');
    const ruleset = await tournaments.findLatestRuleset(created?.tournamentId ?? '');
    expect(ruleset?.descriptorRef).toEqual({
      descriptorId: descriptor.descriptorId,
      version: descriptor.version,
    });
    expect(ruleset?.overrides).toMatchObject({
      format: 'round-robin',
      'registration.publicOpen': true,
      'registration.requiresCheckIn': true,
    });
  });
});

describe('token transport rules', () => {
  it('treats a token passed as a query parameter as unauthenticated', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations?access_token=organizer-org1',
      payload: { alias: 'via-query', name: 'Via Query' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a non-bearer authorization scheme', async () => {
    const response = await (app as NestFastifyApplication).inject({
      method: 'POST',
      url: '/organizations',
      headers: { authorization: 'Basic organizer-org1' },
      payload: { alias: 'via-basic', name: 'Via Basic' } as never,
    });
    expect(response.statusCode).toBe(401);
  });
});
