import type { DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  newId,
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../persistence/src/test-support/scratch-database.js';
import { generateFixtures } from './fixtures/index.js';
import { classifyEngineMutation } from './mutation/index.js';
import { resolveAdvancement } from './advancement/index.js';
import type { RecordedOutcome } from '@copalibre/domain';

/**
 * End-to-end: generate a fixture graph, persist it through phase 0004's
 * repositories, record a result, and confirm advancement and mutation
 * classification hold against real stored state.
 */
const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: newId(),
    version: '1.0.0',
    name: 'Orbital Field',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 9 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['single-elimination'],
    winCondition: { rule: 'higher-score-wins' },
    notificationRuleCapabilities: [],
    defaults: { scoring: { pointsPerWin: 3 } },
    fieldPolicies: {
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
    },
  };
}

describe('tournament engine (integration)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('engine');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-orbital',
        name: 'Liga Orbital',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function seedTournament(alias: string) {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const disciplineDescriptor = descriptor();

    return withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias,
        name: alias,
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const stage = await competition.createStage(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Main Draw',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });
      return { tournament, stage, disciplineDescriptor };
    });
  }

  it('rejects an unsupported format before anything is persisted', async () => {
    const before = await scratch.db
      .selectFrom('fixtures')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();

    const result = generateFixtures({
      format: 'swiss' as never,
      entrants: [1, 2].map((seed) => ({ entrantId: `e${seed}`, seed })),
    });
    expect(result.ok).toBe(false);

    const after = await scratch.db
      .selectFrom('fixtures')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    expect(after.count).toBe(before.count);
  });

  it('persists a generated bracket and advances after a recorded result', async () => {
    const { stage } = await seedTournament('copa-avance');
    const competition = new CompetitionRepository(scratch.db);
    const participants = [1, 2, 3, 4].map((seed) => ({ entrantId: `entrant-${seed}`, seed }));

    const generated = generateFixtures({ format: 'single-elimination', entrants: participants });
    if (!generated.ok) throw generated.error;

    // Persist only the contested first-round fixtures; slot resolution stays in
    // the engine, so the database holds fixtures rather than a mutated graph.
    const firstRound = generated.value.matches.filter((match) => match.round === 1);
    const persisted = await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: firstRound.map((match) => ({ round: match.round })),
        organizationId,
        ...AUDIT,
      }),
    );
    expect(persisted).toHaveLength(2);

    const match = await withTransaction(scratch.db, (uow) =>
      competition.createMatch(uow, {
        fixtureId: persisted[0]?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...AUDIT,
      }),
    );

    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: 'entrant-1', score: 2 },
            { entrantId: 'entrant-4', score: 0 },
          ],
          winnerEntrantId: 'entrant-1',
          recordedAt: '2026-07-30T12:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      }),
    );

    const stored = await competition.findMatch(match.matchId);
    expect(stored?.status).toBe('finalized');

    // Advancement is recomputed from the graph plus the stored outcome.
    const outcomes: RecordedOutcome[] = [
      {
        matchId: 'SE-R1-M1',
        winnerEntrantId: 'entrant-1',
        sides: (stored?.result?.sides ?? []).map((side) => ({
          entrantId: side.entrantId,
          statistics: { score: side.score },
        })),
      },
    ];
    const resolved = resolveAdvancement(generated.value, outcomes);
    expect(resolved.find((m) => m.matchId === 'SE-R2-M1')?.slotA).toEqual({
      state: 'entrant',
      entrantId: 'entrant-1',
    });
  });

  it('blocks a format change once a result exists and names the correction workflow', async () => {
    const { stage } = await seedTournament('copa-bloqueada');
    const competition = new CompetitionRepository(scratch.db);

    const generated = generateFixtures({
      format: 'single-elimination',
      entrants: [1, 2].map((seed) => ({ entrantId: `e${seed}`, seed })),
    });
    if (!generated.ok) throw generated.error;

    const [fixture] = await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      }),
    );
    if (!fixture) throw new Error('fixture not created');

    const match = await withTransaction(scratch.db, (uow) =>
      competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        ...AUDIT,
      }),
    );

    // Before any result: reseeding is a rebuild, not a block.
    expect(
      classifyEngineMutation(
        { kind: 'seeding' },
        { hasRecordedResults: false, hasGeneratedFixtures: true },
        generated.value,
      ).mutationClass,
    ).toBe('requires_rebuild');

    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: 'e1', score: 1 },
            { entrantId: 'e2', score: 0 },
          ],
          winnerEntrantId: 'e1',
          recordedAt: '2026-07-30T12:30:00.000Z',
        },
        organizationId,
        ...AUDIT,
      }),
    );

    const hasResults = (await competition.findMatch(match.matchId))?.result !== undefined;
    expect(hasResults).toBe(true);

    const decision = classifyEngineMutation(
      { kind: 'format' },
      { hasRecordedResults: hasResults, hasGeneratedFixtures: true },
      generated.value,
    );
    expect(decision.mutationClass).toBe('blocked_after_results');
    expect(decision.reason).toContain('correction workflow');

    // And the repository refuses a second result on the same match, so the two
    // layers agree: no silent overwrite anywhere.
    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.recordResult(uow, {
          matchId: match.matchId,
          result: {
            sides: [
              { entrantId: 'e1', score: 0 },
              { entrantId: 'e2', score: 9 },
            ],
            winnerEntrantId: 'e2',
            recordedAt: '2026-07-30T12:45:00.000Z',
          },
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/audited correction workflow/);
  });
});
