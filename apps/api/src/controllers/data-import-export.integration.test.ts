import type { INestApplication } from '@nestjs/common';
import { footballDescriptor, validateCsvImport } from '@copalibre/domain';
import {
  AuditReader,
  CsvImportRepository,
  EnrollmentRepository,
  OrganizationRepository,
  PersonRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { DataImportExportController } from './data-import-export.controller.js';
import { DataExportController } from './data-export.controller.js';

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([
    DataImportExportController,
    DataExportController,
  ]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('CSV import routes', () => {
  it('persists an upload and queues validation without parsing in the request', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();
    await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
      await tournaments.create(uow, {
        organizationId,
        alias: 'copa-importacion',
        name: 'Copa Importacion',
        descriptor,
        actor: 'user:seed',
        authorizationContext: 'seed',
      });
    });

    const created = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/copa-importacion/imports',
      token: 'organizer-org1',
      payload: {
        target: 'team',
        sourceCsv: 'alias,name\\nclub-atletico,Club Atletico\\n',
      },
    });

    expect(created.statusCode).toBe(202);
    expect(created.json()).toMatchObject({ target: 'team', status: 'queued' });
    expect(created.json().preview).toBeUndefined();

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new CsvImportRepository(scratch.db).storePreview(uow, {
        importId: created.json().importId,
        preview: validateCsvImport({
          target: 'team',
          allowedParticipantTypes: ['team'],
          csv: 'alias,name\nclub-atletico,Club Atletico\n',
        }),
      }),
    );

    const preview = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${created.json().importId}`,
      token: 'organizer-org1',
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      importId: created.json().importId,
      status: 'review-ready',
      preview: { valid: true },
    });

    const committed = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${created.json().importId}/commit`,
      token: 'organizer-org1',
      payload: { sourceHash: created.json().sourceHash },
    });
    expect(committed.statusCode).toBe(200);
    expect(committed.json()).toMatchObject({ status: 'committed' });

    const audit = await new AuditReader(scratch.db).historyFor(
      'csv-import',
      created.json().importId,
    );
    expect(audit[0]).toMatchObject({ action: 'csv-import.committed', actor: 'user:organizer-1' });

    const stale = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${created.json().importId}/commit`,
      token: 'organizer-org1',
      payload: { sourceHash: created.json().sourceHash },
    });
    expect(stale.statusCode).toBe(409);

    const participantExport = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/copa-importacion/exports/participants/team',
      token: 'organizer-org1',
    });
    expect(participantExport.statusCode).toBe(200);
    expect(participantExport.body).toBe('alias,name\nclub-atletico,Club Atletico\n');

    const reimport = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/copa-importacion/imports',
      token: 'organizer-org1',
      payload: { target: 'team', sourceCsv: participantExport.body },
    });
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new CsvImportRepository(scratch.db).storePreview(uow, {
        importId: reimport.json().importId,
        preview: validateCsvImport({
          target: 'team',
          allowedParticipantTypes: ['team'],
          csv: participantExport.body,
        }),
      }),
    );
    const recommitted = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${reimport.json().importId}/commit`,
      token: 'organizer-org1',
      payload: { sourceHash: reimport.json().sourceHash },
    });
    expect(recommitted.statusCode).toBe(200);
    const roundTrip = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/copa-importacion/exports/participants/team',
      token: 'organizer-org1',
    });
    expect(roundTrip.body).toBe(participantExport.body);
  });

  it('never commits a preview containing invalid rows', async () => {
    const created = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/copa-importacion/imports',
      token: 'organizer-org1',
      payload: { target: 'team', sourceCsv: 'alias,name\nINVALID,\n' },
    });
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new CsvImportRepository(scratch.db).storePreview(uow, {
        importId: created.json().importId,
        preview: validateCsvImport({
          target: 'team',
          allowedParticipantTypes: ['team'],
          csv: 'alias,name\nINVALID,\n',
        }),
      }),
    );
    const committed = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${created.json().importId}/commit`,
      token: 'organizer-org1',
      payload: { sourceHash: created.json().sourceHash },
    });
    expect(committed.statusCode).toBe(409);
  });

  it('rejects a source larger than 4 MiB before creating a durable job', async () => {
    const response = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/copa-importacion/imports',
      token: 'organizer-org1',
      payload: { target: 'team', sourceCsv: 'x'.repeat(4 * 1024 * 1024 + 1) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('4 MiB');
  });

  it('escapes a formula-shaped team name on export', async () => {
    const sourceCsv = 'alias,name\nequipo-formula,=SUM(A1:A2)\n';
    const created = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/copa-importacion/imports',
      token: 'organizer-org1',
      payload: { target: 'team', sourceCsv },
    });
    expect(created.statusCode).toBe(202);

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new CsvImportRepository(scratch.db).storePreview(uow, {
        importId: created.json().importId,
        preview: validateCsvImport({
          target: 'team',
          allowedParticipantTypes: ['team'],
          csv: sourceCsv,
        }),
      }),
    );

    const committed = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-importacion/imports/${created.json().importId}/commit`,
      token: 'organizer-org1',
      payload: { sourceHash: created.json().sourceHash },
    });
    expect(committed.statusCode).toBe(200);

    const exported = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/tournaments/copa-importacion/exports/participants/team',
      token: 'organizer-org1',
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.body).toContain("equipo-formula,'=SUM(A1:A2)");
  });
});

describe('team-membership CSV import target (0065)', () => {
  async function seedTwoRegisteredTeams(tournamentAlias: string) {
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const descriptor = footballDescriptor();
    const seedAudit = { actor: 'user:seed', authorizationContext: 'seed' };

    return withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...seedAudit });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: tournamentAlias,
        name: tournamentAlias,
        descriptor,
        ...seedAudit,
      });
      const teamA = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Club Atletico',
        ...seedAudit,
      });
      await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: teamA.teamId },
        ...seedAudit,
      });
      const teamB = await enrollment.createTeam(uow, {
        organizationId,
        name: 'Club Belgrano',
        ...seedAudit,
      });
      await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: teamB.teamId },
        ...seedAudit,
      });
      return { tournament, teamA, teamB };
    });
  }

  it('attaches each row’s person onto its own already-registered team, spanning multiple teams in one file', async () => {
    const people = new PersonRepository(scratch.db);
    const seeded = await seedTwoRegisteredTeams('copa-membresia-csv');
    const teamAAlias = seeded.teamA.alias ?? '';
    const teamBAlias = seeded.teamB.alias ?? '';
    const sourceCsv = `teamAlias,alias,displayName\n${teamAAlias},maria-perez,Maria Perez\n${teamBAlias},juan-diaz,Juan Diaz\n`;

    const created = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/copa-membresia-csv/imports',
      token: 'organizer-org1',
      payload: { target: 'team-membership', sourceCsv },
    });
    expect(created.statusCode).toBe(202);

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new CsvImportRepository(scratch.db).storePreview(uow, {
        importId: created.json().importId,
        preview: validateCsvImport({
          target: 'team-membership',
          allowedParticipantTypes: ['team'],
          knownTeamAliases: [teamAAlias, teamBAlias],
          csv: sourceCsv,
        }),
      }),
    );

    const committed = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-membresia-csv/imports/${created.json().importId}/commit`,
      token: 'organizer-org1',
      payload: { sourceHash: created.json().sourceHash },
    });
    expect(committed.statusCode).toBe(200);

    const squadA = await people.squadOf(seeded.teamA.teamId);
    const squadB = await people.squadOf(seeded.teamB.teamId);
    const personA = await people.findByAlias(organizationId, 'maria-perez');
    const personB = await people.findByAlias(organizationId, 'juan-diaz');

    expect(squadA.map((player) => player.personId)).toEqual([personA?.personId]);
    expect(squadB.map((player) => player.personId)).toEqual([personB?.personId]);
  });

  it('never commits a preview whose row names an unregistered team', async () => {
    const people = new PersonRepository(scratch.db);
    const seeded = await seedTwoRegisteredTeams('copa-membresia-invalida');
    const sourceCsv = 'teamAlias,alias,displayName\nclub-fantasma,maria-perez,Maria Perez\n';

    const created = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/copa-membresia-invalida/imports',
      token: 'organizer-org1',
      payload: { target: 'team-membership', sourceCsv },
    });

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new CsvImportRepository(scratch.db).storePreview(uow, {
        importId: created.json().importId,
        preview: validateCsvImport({
          target: 'team-membership',
          allowedParticipantTypes: ['team'],
          knownTeamAliases: [seeded.teamA.alias ?? '', seeded.teamB.alias ?? ''],
          csv: sourceCsv,
        }),
      }),
    );

    const preview = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/tournaments/copa-membresia-invalida/imports/${created.json().importId}`,
      token: 'organizer-org1',
    });
    expect(preview.json()).toMatchObject({ status: 'invalid' });

    const committed = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-membresia-invalida/imports/${created.json().importId}/commit`,
      token: 'organizer-org1',
      payload: { sourceHash: created.json().sourceHash },
    });
    expect(committed.statusCode).toBe(409);

    const squadA = await people.squadOf(seeded.teamA.teamId);
    const squadB = await people.squadOf(seeded.teamB.teamId);
    expect(squadA).toHaveLength(0);
    expect(squadB).toHaveLength(0);
  });

  it('refuses commit, without writing anything, when a validated row’s team no longer resolves', async () => {
    // Simulates the preview/commit race design.md calls out: the stored
    // preview says the row is valid (as the worker would have, at the
    // time), but the team it named is not actually a registered entrant in
    // this tournament by commit time.
    const people = new PersonRepository(scratch.db);
    const seeded = await seedTwoRegisteredTeams('copa-membresia-carrera');
    const sourceCsv =
      'teamAlias,alias,displayName\nclub-jamas-registrado,noelia-vega,Noelia Vega\n';

    const created = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/copa-membresia-carrera/imports',
      token: 'organizer-org1',
      payload: { target: 'team-membership', sourceCsv },
    });

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new CsvImportRepository(scratch.db).storePreview(uow, {
        importId: created.json().importId,
        preview: {
          target: 'team-membership',
          valid: true,
          rows: [
            {
              rowNumber: 2,
              values: {
                teamAlias: 'club-jamas-registrado',
                alias: 'noelia-vega',
                displayName: 'Noelia Vega',
              },
              errors: [],
            },
          ],
          errors: [],
        },
      }),
    );

    const committed = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-membresia-carrera/imports/${created.json().importId}/commit`,
      token: 'organizer-org1',
      payload: { sourceHash: created.json().sourceHash },
    });
    expect(committed.statusCode).toBe(409);
    expect(committed.json().message).toContain('club-jamas-registrado');

    expect(await people.findByAlias(organizationId, 'noelia-vega')).toBeUndefined();
    const squadA = await people.squadOf(seeded.teamA.teamId);
    expect(squadA).toHaveLength(0);
  });

  it('treats a team alias belonging to a different organization as unresolved, not attached', async () => {
    const enrollment = new EnrollmentRepository(scratch.db);
    const people = new PersonRepository(scratch.db);
    const seeded = await seedTwoRegisteredTeams('copa-membresia-cruzada');

    const otherOrganization = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-vecina',
        name: 'Liga Vecina',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    const foreignTeam = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      enrollment.createTeam(uow, {
        organizationId: otherOrganization.organizationId,
        name: 'Club De Otra Liga',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    const foreignAlias = foreignTeam.alias ?? '';

    const sourceCsv = `teamAlias,alias,displayName\n${foreignAlias},sofia-luna,Sofia Luna\n`;
    const created = await request({
      method: 'POST',
      url: '/organizations/liga-orbital/tournaments/copa-membresia-cruzada/imports',
      token: 'organizer-org1',
      payload: { target: 'team-membership', sourceCsv },
    });

    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      new CsvImportRepository(scratch.db).storePreview(uow, {
        importId: created.json().importId,
        preview: validateCsvImport({
          target: 'team-membership',
          allowedParticipantTypes: ['team'],
          // The worker only ever resolves known aliases from *this*
          // tournament's own organization, so the foreign alias is
          // deliberately absent here too — same as production.
          knownTeamAliases: [seeded.teamA.alias ?? '', seeded.teamB.alias ?? ''],
          csv: sourceCsv,
        }),
      }),
    );

    const committed = await request({
      method: 'POST',
      url: `/organizations/liga-orbital/tournaments/copa-membresia-cruzada/imports/${created.json().importId}/commit`,
      token: 'organizer-org1',
      payload: { sourceHash: created.json().sourceHash },
    });
    expect(committed.statusCode).toBe(409);

    expect(await people.findByAlias(organizationId, 'sofia-luna')).toBeUndefined();
    const foreignSquad = await people.squadOf(foreignTeam.teamId);
    expect(foreignSquad).toHaveLength(0);
  });

  it('re-committing the same file is additive and idempotent: no duplicate membership or audit rows', async () => {
    const people = new PersonRepository(scratch.db);
    const seeded = await seedTwoRegisteredTeams('copa-membresia-reimport');
    const teamAAlias = seeded.teamA.alias ?? '';
    const sourceCsv = `teamAlias,alias,displayName\n${teamAAlias},maria-perez,Maria Perez\n`;

    async function importOnce() {
      const created = await request({
        method: 'POST',
        url: '/organizations/liga-orbital/tournaments/copa-membresia-reimport/imports',
        token: 'organizer-org1',
        payload: { target: 'team-membership', sourceCsv },
      });
      await withTransaction(scratch.db as Kysely<Database>, (uow) =>
        new CsvImportRepository(scratch.db).storePreview(uow, {
          importId: created.json().importId,
          preview: validateCsvImport({
            target: 'team-membership',
            allowedParticipantTypes: ['team'],
            knownTeamAliases: [teamAAlias],
            csv: sourceCsv,
          }),
        }),
      );
      return request({
        method: 'POST',
        url: `/organizations/liga-orbital/tournaments/copa-membresia-reimport/imports/${created.json().importId}/commit`,
        token: 'organizer-org1',
        payload: { sourceHash: created.json().sourceHash },
      });
    }

    const first = await importOnce();
    expect(first.statusCode).toBe(200);
    const second = await importOnce();
    expect(second.statusCode).toBe(200);

    const squadA = await people.squadOf(seeded.teamA.teamId);
    expect(squadA).toHaveLength(1);

    const enlistedRows = await scratch.db
      .selectFrom('audit_log')
      .select('audit_id')
      .where('organization_id', '=', organizationId)
      .where('entity_type', '=', 'player')
      .where('action', '=', 'player.enlisted')
      .where('entity_id', '=', squadA[0]?.playerId ?? '')
      .execute();
    expect(enlistedRows).toHaveLength(1);
  });
});
