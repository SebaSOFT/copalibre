import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  EnrollmentRepository,
  PersonRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import {
  DisciplinesController,
  EntrantsController,
  RegistrationsController,
} from './registrations.controller.js';

/**
 * Direct participant authoring (openspec 0167): a person or team registered
 * without a CSV file, through the same repository paths a CSV row already
 * takes. Covers tasks.md sections 2 (behavioural coverage of the
 * create/edit/collision paths) and 3 (the CSV-interop and
 * association-preservation guarantees) together — both need the same real
 * Postgres harness, so nothing is gained by splitting the file. Wired into
 * the `integration-tests` CI job only: there is no Postgres-free unit-level
 * version of this behaviour to test, since every path here writes through
 * `UnitOfWork`.
 */

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];
const tournamentAlias = 'copa-alta-directa';
const base = `/organizations/liga-orbital/tournaments/${tournamentAlias}/registrations`;

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([
    RegistrationsController,
    EntrantsController,
    DisciplinesController,
  ]));

  const tournaments = new TournamentRepository(scratch.db);
  const descriptor = footballDescriptor();
  await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
    await tournaments.saveDescriptor(uow, descriptor, {
      organizationId,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    const tournament = await tournaments.create(uow, {
      organizationId,
      alias: tournamentAlias,
      name: 'Copa Alta Directa',
      descriptor,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    return tournament.tournamentId;
  });
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('direct-add a person (task 1.1)', () => {
  it('registers a person as a pending entrant, and a later import recognises them by natural key', async () => {
    const response = await request({
      method: 'POST',
      url: `${base}/persons`,
      token: 'organizer-org1',
      payload: {
        displayName: 'Elías Salomón',
        naturalKeyKind: 'dni',
        naturalKeyValue: '30123456',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe('pending');
    expect(body.displayName).toBe('Elías Salomón');
    expect(body.personId).toBeDefined();

    // The CSV importer's own per-row reconciliation — not driven through the
    // async upload/worker pipeline here, since that infrastructure is
    // unrelated to this change; the guarantee this change makes is that the
    // record it created is indistinguishable, to that reconciliation, from
    // one a CSV row would have produced.
    const replacement = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new PersonRepository(scratch.db).replaceByAlias(uow, {
        organizationId,
        alias: 'a-different-alias-entirely',
        displayName: 'Elías Salomón (corregido)',
        naturalKey: { kind: 'dni', value: '30123456' },
        actor: 'user:importer',
        authorizationContext: 'csv-import',
      }),
    );
    // `replaceByAlias`'s own `created` flag is not reliable here — it
    // hardcodes `true` whenever the alias lookup misses, even when the
    // `register()` call it delegates to recognises an existing person by
    // natural key underneath (a pre-existing quirk this change's scope does
    // not touch: the flag is unused by the CSV importer, its only caller).
    // The property that actually matters, and that this asserts, is that no
    // second person row was created — the same personId comes back.
    expect(replacement.person.personId).toBe(body.personId);
  });
});

describe('direct-add a team (task 1.2)', () => {
  it('registers a team as a pending entrant, and a later import recognises them by alias', async () => {
    const response = await request({
      method: 'POST',
      url: `${base}/teams`,
      token: 'organizer-org1',
      payload: { name: 'Talleres', alias: 'talleres-directo' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe('pending');
    expect(body.teamId).toBeDefined();

    const replacement = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new EnrollmentRepository(scratch.db).replaceTeamByAlias(uow, {
        organizationId,
        alias: 'talleres-directo',
        name: 'Talleres (nombre corregido)',
        actor: 'user:importer',
        authorizationContext: 'csv-import',
      }),
    );
    expect(replacement.created).toBe(false);
    expect(replacement.team.teamId).toBe(body.teamId);
  });
});

describe('identity edit preserves existing associations (task 1.3)', () => {
  it("corrects a directly-added team's name without disturbing its entrant registration", async () => {
    const created = await request({
      method: 'POST',
      url: `${base}/teams`,
      token: 'organizer-org1',
      payload: { name: 'Deportivo Maipú' },
    });
    expect(created.statusCode).toBe(201);
    const { teamId, entrantId } = created.json();

    const edited = await request({
      method: 'PATCH',
      url: `${base}/teams/${teamId}`,
      token: 'organizer-org1',
      payload: { name: 'Deportivo Maipú (corregido)' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ teamId, name: 'Deportivo Maipú (corregido)' });

    const entrant = await new EnrollmentRepository(scratch.db).findEntrant(entrantId);
    expect(entrant?.entrantRef).toMatchObject({ kind: 'team', teamId });
    expect(entrant?.status).toBe('pending');
  });

  it("corrects a directly-added person's display name without disturbing their entrant registration", async () => {
    const created = await request({
      method: 'POST',
      url: `${base}/persons`,
      token: 'organizer-org1',
      payload: { displayName: 'Mariano Otero' },
    });
    expect(created.statusCode).toBe(201);
    const { personId, entrantId } = created.json();

    const edited = await request({
      method: 'PATCH',
      url: `${base}/persons/${personId}`,
      token: 'organizer-org1',
      payload: { displayName: 'Mariano Otero (corregido)' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ personId, displayName: 'Mariano Otero (corregido)' });

    const entrant = await new EnrollmentRepository(scratch.db).findEntrant(entrantId);
    expect(entrant?.entrantRef).toMatchObject({ kind: 'person', personId });
  });
});

describe('alias collision is refused, on create and on edit (task 1.4)', () => {
  it('refuses creating a team whose explicit alias is already claimed', async () => {
    const first = await request({
      method: 'POST',
      url: `${base}/teams`,
      token: 'organizer-org1',
      payload: { name: 'Gimnasia', alias: 'gimnasia-claimed' },
    });
    expect(first.statusCode).toBe(201);

    const second = await request({
      method: 'POST',
      url: `${base}/teams`,
      token: 'organizer-org1',
      payload: { name: 'Gimnasia B', alias: 'gimnasia-claimed' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().message).toContain('already uses this alias');
  });

  it('refuses creating a person whose explicit alias is already claimed', async () => {
    const first = await request({
      method: 'POST',
      url: `${base}/persons`,
      token: 'organizer-org1',
      payload: { displayName: 'Persona Uno', alias: 'persona-claimed' },
    });
    expect(first.statusCode).toBe(201);

    const second = await request({
      method: 'POST',
      url: `${base}/persons`,
      token: 'organizer-org1',
      payload: { displayName: 'Persona Dos', alias: 'persona-claimed' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().message).toContain('already uses this alias');
  });

  it("refuses editing a team's alias to one another team already holds", async () => {
    const holder = await request({
      method: 'POST',
      url: `${base}/teams`,
      token: 'organizer-org1',
      payload: { name: 'Independiente Rivadavia', alias: 'holder-alias' },
    });
    const editing = await request({
      method: 'POST',
      url: `${base}/teams`,
      token: 'organizer-org1',
      payload: { name: 'Huracán Las Heras' },
    });
    expect(holder.statusCode).toBe(201);
    expect(editing.statusCode).toBe(201);

    const attempt = await request({
      method: 'PATCH',
      url: `${base}/teams/${editing.json().teamId}`,
      token: 'organizer-org1',
      payload: { alias: 'holder-alias' },
    });
    expect(attempt.statusCode).toBe(409);
    expect(attempt.json().message).toContain('already uses this alias');
  });

  it("refuses editing a person's alias to one another person already holds", async () => {
    const holder = await request({
      method: 'POST',
      url: `${base}/persons`,
      token: 'organizer-org1',
      payload: { displayName: 'Titular Alias', alias: 'persona-holder' },
    });
    const editing = await request({
      method: 'POST',
      url: `${base}/persons`,
      token: 'organizer-org1',
      payload: { displayName: 'Otra Persona' },
    });
    expect(holder.statusCode).toBe(201);
    expect(editing.statusCode).toBe(201);

    const attempt = await request({
      method: 'PATCH',
      url: `${base}/persons/${editing.json().personId}`,
      token: 'organizer-org1',
      payload: { alias: 'persona-holder' },
    });
    expect(attempt.statusCode).toBe(409);
    expect(attempt.json().message).toContain('already uses this alias');
  });
});
