import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { buildTestApp } from './test-support/integration-harness.js';
import { ZonesGroupsController } from './zones-groups.controller.js';

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;
const organizationAlias = 'liga-orbital';
const tournamentAlias = 'copa-formatos';

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-000000009902',
    version: '1.0.0',
    name: 'Copa de formatos',
    attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [{ code: 'points', label: 'Puntos', aggregation: 'sum' }],
    scoringInputs: [],
    availableFormats: ['single-elimination', 'round-robin'],
    notificationRuleCapabilities: [],
    winCondition: {},
    defaults: {},
    fieldPolicies: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
    },
  } as unknown as DisciplineDescriptor;
}

describe('zone format and series configuration (integration)', () => {
  const base = `/organizations/${organizationAlias}/tournaments/${tournamentAlias}/stages`;
  let harness: Awaited<ReturnType<typeof buildTestApp>>;
  let tournamentId = '';

  beforeAll(async () => {
    harness = await buildTestApp([ZonesGroupsController]);
    const tournaments = new TournamentRepository(harness.scratch.db);
    const competition = new CompetitionRepository(harness.scratch.db);
    const discipline = descriptor();

    tournamentId = await withTransaction(harness.scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, discipline, {
        organizationId: harness.organizationId,
        ...AUDIT,
      });
      const tournament = await tournaments.create(uow, {
        organizationId: harness.organizationId,
        alias: tournamentAlias,
        name: 'Copa Formatos',
        descriptor: discipline,
        ...AUDIT,
      });
      await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: harness.organizationId,
        descriptor: discipline,
        overrides: { format: 'single-elimination' },
        ...AUDIT,
      });
      for (const number of [1, 2]) {
        await competition.createStageInTournament(uow, {
          tournamentId: tournament.tournamentId,
          number,
          name: `Fase ${number}`,
          format: 'single-elimination',
          organizationId: harness.organizationId,
          ...AUDIT,
        });
      }
      return tournament.tournamentId;
    });
    await withTransaction(harness.scratch.db, (uow) =>
      tournaments.publish(uow, {
        tournamentId,
        organizationId: harness.organizationId,
        ...AUDIT,
      }),
    );

    for (const stageNumber of [1, 2]) {
      for (const name of ['Zona 1', 'Zona 2', 'Zona 3']) {
        const created = await harness.request({
          method: 'POST',
          url: `${base}/${stageNumber}/zones`,
          token: 'organizer-org1',
          payload: { name },
        });
        expect(created.statusCode).toBe(201);
      }
    }
  });

  afterAll(async () => {
    await harness?.app.close();
    await harness?.scratch.drop();
  });

  const configure = (stage: number, zone: number, payload: unknown, token = 'organizer-org1') =>
    harness.request({
      method: 'PUT',
      url: `${base}/${stage}/zones/${zone}/configuration`,
      token,
      payload,
    });
  const zonesOf = async (stage: number) =>
    (await harness.request({ method: 'GET', url: `${base}/${stage}/zones` })).json() as {
      number: number;
      format?: string;
      effectiveFormat: string;
      series?: { span: number };
    }[];

  it('reports every zone as inheriting its stage until one declares a format', async () => {
    expect(await zonesOf(1)).toEqual([
      expect.objectContaining({ number: 1, effectiveFormat: 'single-elimination' }),
      expect.objectContaining({ number: 2, effectiveFormat: 'single-elimination' }),
      expect.objectContaining({ number: 3, effectiveFormat: 'single-elimination' }),
    ]);
    expect((await zonesOf(1)).some((zone) => zone.format !== undefined)).toBe(false);
  });

  it('requires an administrator', async () => {
    expect((await configure(1, 3, { format: 'round-robin' }, 'participant-org1')).statusCode).toBe(
      403,
    );
    const anonymous = await harness.request({
      method: 'PUT',
      url: `${base}/1/zones/3/configuration`,
      payload: { format: 'round-robin' },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('sets a zone format, leaves its siblings inheriting, and clears it with null', async () => {
    const set = await configure(1, 3, { format: 'round-robin' });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toMatchObject({
      number: 3,
      format: 'round-robin',
      effectiveFormat: 'round-robin',
    });
    expect((await zonesOf(1)).map((zone) => zone.effectiveFormat)).toEqual([
      'single-elimination',
      'single-elimination',
      'round-robin',
    ]);

    const cleared = await configure(1, 3, { format: null });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().format).toBeUndefined();
    expect(cleared.json().effectiveFormat).toBe('single-elimination');
  });

  it('refuses a format the discipline does not offer', async () => {
    const response = await configure(1, 3, { format: 'swiss' });

    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('zone-group-bad-request');
    expect((await zonesOf(1))[2]?.format).toBeUndefined();
  });

  it('declares and clears a zone series without touching the stage or its siblings', async () => {
    const set = await configure(2, 1, { series: { span: 3, resolutionClass: 'best-of' } });
    expect(set.statusCode).toBe(200);
    expect(set.json().series).toMatchObject({ span: 3, resolutionClass: 'best-of' });
    expect((await zonesOf(2)).map((zone) => zone.series?.span)).toEqual([3, undefined, undefined]);

    const cleared = await configure(2, 1, { series: null });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().series).toBeUndefined();
    expect((await zonesOf(2)).every((zone) => zone.series === undefined)).toBe(true);
  });

  it('refuses a malformed series', async () => {
    const response = await configure(2, 2, { series: { span: 1 } });
    expect(response.statusCode).toBe(400);
  });

  it('is refused once the stage holds a fixture, and changes nothing', async () => {
    const competition = new CompetitionRepository(harness.scratch.db);
    const stage = (await competition.listStagesOfTournament(tournamentId)).find(
      (candidate) => candidate.number === 2,
    );
    await withTransaction(harness.scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage?.stageId as string,
        fixtures: [{ round: 1 }],
        organizationId: harness.organizationId,
        ...AUDIT,
      }),
    );

    const format = await configure(2, 2, { format: 'round-robin' });
    expect(format.statusCode).toBe(409);
    const series = await configure(2, 2, { series: { span: 3, resolutionClass: 'best-of' } });
    expect(series.statusCode).toBe(409);
    expect((await zonesOf(2)).every((zone) => zone.format === undefined)).toBe(true);
    expect((await zonesOf(2)).every((zone) => zone.series === undefined)).toBe(true);
  });
});
