import { tagsAt, type TagDeclaration, type TagFact } from '@copalibre/domain';
import { AuditReader } from '../audit.js';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import { StatisticProjection, type Refold } from '../projections/statistic-projection.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { StatisticRepository, type StoredFigure } from './statistic-repository.js';
import { TagRepository } from './tag-repository.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';

/**
 * Folded figures against a real database (0016).
 *
 * The promise under test is narrow and load-bearing: **every total is a fold**.
 * Nothing here increments a stored number, a correction recomputes rather than
 * compensates, and reading the same facts twice gives the same answer.
 */

const AUDIT = { actor: 'user:table-official-1', authorizationContext: 'capability:match.finalize' };

const PERSON_A = 'pe-1';
const PERSON_B = 'pe-2';

function figure(overrides: Partial<StoredFigure> = {}): StoredFigure {
  return {
    collectorCode: 'goals',
    actorGranularity: 'person',
    actorId: PERSON_A,
    competitionGranularity: 'match',
    competitionId: 'm-1',
    value: 1,
    samples: 1,
    ...overrides,
  };
}

describe('statistic totals (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let tournamentId: string;
  let stageNumber = 1;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('statistics');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-sanjuanina',
        name: 'Liga Sanjuanina',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
    tournamentId = newId();
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  /** A match the figures can hang off. */
  async function playableMatch(label: string): Promise<string> {
    const competition = new CompetitionRepository(scratch.db);
    return withTransaction(scratch.db, async (uow) => {
      await uow.tx
        .insertInto('tournaments')
        .values({
          tournament_id: tournamentId,
          organization_id: organizationId,
          alias: 'torneo-apertura',
          name: 'Torneo Apertura',
          descriptor_id: newId(),
          descriptor_version: '1.0.0',
          ruleset_id: null,
          status: 'draft',
          started_at: null,
          profile_id: null,
          profile_version: null,
          created_at: new Date(),
        })
        .onConflict((conflict) => conflict.doNothing())
        .execute();

      const stage = await competition.createStageInTournament(uow, {
        tournamentId,
        number: stageNumber++,
        name: `Fecha ${label}`,
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      return match.matchId;
    });
  }

  async function project(matchId: string, figures: readonly StoredFigure[], eventType: string) {
    const statistics = new StatisticRepository(scratch.db);
    const refold: Refold = async () => figures;
    return withTransaction(scratch.db, (uow) =>
      new StatisticProjection(statistics, refold).apply(uow, {
        eventType,
        organizationId,
        entityId: matchId,
        projectionVersion: 1,
      }),
    );
  }

  it('writes figures at every granularity the collectors declare, from one pass', async () => {
    const matchId = await playableMatch('one-pass');
    const statistics = new StatisticRepository(scratch.db);

    await project(
      matchId,
      [
        figure({ competitionId: matchId }),
        figure({ actorId: PERSON_B, competitionId: matchId }),
        figure({
          actorGranularity: 'team',
          actorId: 'tm-atlas',
          competitionId: matchId,
          value: 2,
          samples: 2,
        }),
        figure({
          competitionGranularity: 'tournament',
          competitionId: tournamentId,
          value: 1,
        }),
      ],
      'match.finalized',
    );

    const perPerson = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );
    const perTeam = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals',
        actorGranularity: 'team',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );

    // The team figure and the person figures came from one fold, so they cannot
    // disagree about the match they describe.
    expect(perPerson).toHaveLength(2);
    expect(perTeam[0]?.value).toBe(2);
  });

  it('recomputes on a correction and leaves no total the facts do not support', async () => {
    const matchId = await playableMatch('correction');
    const statistics = new StatisticRepository(scratch.db);
    const key = {
      organizationId,
      collectorCode: 'goals',
      actorGranularity: 'person',
      competitionGranularity: 'match',
      competitionId: matchId,
    } as const;

    await project(
      matchId,
      [figure({ competitionId: matchId, value: 2, samples: 2 })],
      'match.finalized',
    );
    await project(
      matchId,
      // The goal was disallowed: the fold no longer produces a figure for B, and
      // A's is one lower.
      [figure({ competitionId: matchId, value: 1, samples: 1 })],
      'result.superseded',
    );

    const totals = await statistics.readTotals(key, { kind: 'count' });

    expect(totals).toEqual([{ actorId: PERSON_A, competitionId: matchId, value: 1, samples: 1 }]);
  });

  it('leaves nothing standing when a superseded result supports no figures at all', async () => {
    const matchId = await playableMatch('emptied');
    const statistics = new StatisticRepository(scratch.db);

    await project(matchId, [figure({ competitionId: matchId })], 'match.finalized');
    await project(matchId, [], 'result.superseded');

    expect(
      await statistics.readTotals(
        {
          organizationId,
          collectorCode: 'goals',
          actorGranularity: 'person',
          competitionGranularity: 'match',
          competitionId: matchId,
        },
        { kind: 'count' },
      ),
    ).toEqual([]);
  });

  it('projects the same facts twice to the same totals, so nothing is counted twice', async () => {
    const matchId = await playableMatch('idempotent');
    const statistics = new StatisticRepository(scratch.db);
    const figures = [figure({ competitionId: matchId, value: 3, samples: 3 })];

    await project(matchId, figures, 'match.finalized');
    await project(matchId, figures, 'match.finalized');

    const totals = await statistics.readTotals(
      {
        organizationId,
        collectorCode: 'goals',
        actorGranularity: 'person',
        competitionGranularity: 'match',
        competitionId: matchId,
      },
      { kind: 'count' },
    );

    expect(totals[0]?.value).toBe(3);
  });

  it('adds a person across two matches, and recomputes an average from the samples', async () => {
    const first = await playableMatch('season-a');
    const second = await playableMatch('season-b');
    const statistics = new StatisticRepository(scratch.db);
    const seasonKey = {
      organizationId,
      collectorCode: 'accuracy',
      actorGranularity: 'person',
      competitionGranularity: 'tournament',
      competitionId: tournamentId,
    } as const;

    await project(
      first,
      [
        figure({
          collectorCode: 'accuracy',
          competitionGranularity: 'tournament',
          competitionId: tournamentId,
          value: 10,
          samples: 1,
        }),
      ],
      'match.finalized',
    );
    await project(
      second,
      [
        figure({
          collectorCode: 'accuracy',
          competitionGranularity: 'tournament',
          competitionId: tournamentId,
          value: 2,
          samples: 9,
        }),
      ],
      'match.finalized',
    );

    const counted = await statistics.readTotals(seasonKey, { kind: 'count' });
    const averaged = await statistics.readTotals(seasonKey, { kind: 'average', field: 'x' });

    // Counted, the two matches add. Averaged, they weigh by what each was
    // computed from — the mean of the means would be 6, and only one of those
    // is the average.
    expect(counted[0]?.value).toBe(12);
    expect(averaged[0]?.value).toBeCloseTo(2.8, 5);
  });

  it('ignores an event it does not project, rather than clearing a match', async () => {
    const matchId = await playableMatch('unrelated');
    const statistics = new StatisticRepository(scratch.db);

    await project(matchId, [figure({ competitionId: matchId })], 'match.finalized');
    const outcome = await project(matchId, [], 'match.scheduled');

    expect(outcome.applied).toBe(false);
    expect(
      await statistics.readTotals(
        {
          organizationId,
          collectorCode: 'goals',
          actorGranularity: 'person',
          competitionGranularity: 'match',
          competitionId: matchId,
        },
        { kind: 'count' },
      ),
    ).toHaveLength(1);
  });
});

describe('adjustments (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let matchId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('adjustments');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-sanjuanina',
        name: 'Liga Sanjuanina',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;

    const competition = new CompetitionRepository(scratch.db);
    matchId = await withTransaction(scratch.db, async (uow) => {
      const tournamentId = newId();
      await uow.tx
        .insertInto('tournaments')
        .values({
          tournament_id: tournamentId,
          organization_id: organizationId,
          alias: 'torneo-clausura',
          name: 'Torneo Clausura',
          descriptor_id: newId(),
          descriptor_version: '1.0.0',
          ruleset_id: null,
          status: 'draft',
          started_at: null,
          profile_id: null,
          profile_version: null,
          created_at: new Date(),
        })
        .execute();
      const stage = await competition.createStageInTournament(uow, {
        tournamentId,
        number: 1,
        name: 'Fecha 1',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      return match.matchId;
    });
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('records a hand correction as a fact, with who and why, and reads it back for the fold', async () => {
    const statistics = new StatisticRepository(scratch.db);

    const adjustmentId = await withTransaction(scratch.db, (uow) =>
      statistics.recordAdjustment(uow, {
        organizationId,
        matchId,
        adjustment: {
          collectorCode: 'points',
          actorGranularity: 'team',
          actorId: 'tm-atlas',
          delta: -3,
          reason: 'Fielded an unregistered player',
          actor: 'user:table-official-1',
        },
        ...AUDIT,
      }),
    );

    const stored = await statistics.adjustmentsOf(matchId);
    const audit = await new AuditReader(scratch.db).historyFor(
      'statistic-adjustment',
      adjustmentId,
    );

    expect(stored).toEqual([
      {
        collectorCode: 'points',
        actorGranularity: 'team',
        actorId: 'tm-atlas',
        delta: -3,
        reason: 'Fielded an unregistered player',
        actor: 'user:table-official-1',
      },
    ]);
    // The correction survives a replay because it is folded, not applied — and
    // it carries a name, because "who moved this number" must have an answer.
    expect(audit[0]?.action).toBe('statistic.adjusted');
    expect(audit[0]?.reason).toBe('Fielded an unregistered player');
  });

  it('refuses a correction nobody explained, before it becomes a fact', async () => {
    const statistics = new StatisticRepository(scratch.db);

    await expect(
      withTransaction(scratch.db, (uow) =>
        statistics.recordAdjustment(uow, {
          organizationId,
          matchId,
          adjustment: {
            collectorCode: 'points',
            actorGranularity: 'team',
            actorId: 'tm-atlas',
            delta: -1,
            reason: '   ',
            actor: 'user:table-official-1',
          },
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });
});

describe('tags (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;

  const suspended: TagDeclaration = {
    code: 'suspended',
    label: 'Suspendido',
    appliesTo: ['person'],
    exclusive: true,
  };

  function fact(overrides: Partial<TagFact> = {}): TagFact {
    return {
      code: 'suspended',
      action: 'applied',
      actorGranularity: 'person',
      actorId: 'pe-1',
      competitionGranularity: 'season',
      competitionId: 'se-1',
      actor: 'user:tribunal-1',
      reason: 'Expulsión con informe',
      at: '2026-08-01T20:00:00.000Z',
      ...overrides,
    };
  }

  beforeAll(async () => {
    scratch = await createMigratedDatabase('tags');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-sanjuanina',
        name: 'Liga Sanjuanina',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('survives storage, reads as applying, and applies once when re-evaluated', async () => {
    const tags = new TagRepository(scratch.db);
    const applied = fact({ actorId: 'pe-storage', actor: 'script:discipline' });

    await withTransaction(scratch.db, (uow) =>
      tags.record(uow, { organizationId, fact: applied, ...AUDIT }),
    );

    const facts = await tags.factsFor({ organizationId, actorId: 'pe-storage' });
    const standing = tagsAt([suspended], facts);

    expect(standing).toHaveLength(1);
    expect(standing[0]?.appliedBy).toBe('script:discipline');
    // Evaluating the same facts again gives one tag, not two: the read is a
    // fold, so re-reading cannot accumulate.
    expect(tagsAt([suspended], [...facts, ...facts])).toHaveLength(1);
  });

  it('lifts by recording a second fact, keeping the first readable', async () => {
    const tags = new TagRepository(scratch.db);
    const subject = 'pe-lifted';

    await withTransaction(scratch.db, async (uow) => {
      await tags.record(uow, { organizationId, fact: fact({ actorId: subject }), ...AUDIT });
      await tags.record(uow, {
        organizationId,
        fact: fact({
          actorId: subject,
          action: 'lifted',
          at: '2026-08-05T20:00:00.000Z',
          reason: 'Apelación aceptada',
        }),
        ...AUDIT,
      });
    });

    const facts = await tags.factsFor({ organizationId, actorId: subject });

    expect(tagsAt([suspended], facts)).toEqual([]);
    // Nothing was deleted, so "was he suspended when that match was played?"
    // stays answerable.
    expect(facts.map((one) => one.action)).toEqual(['applied', 'lifted']);
    expect(facts[1]?.reason).toBe('Apelación aceptada');
  });

  it('filters by subject and by scope', async () => {
    const tags = new TagRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      await tags.record(uow, {
        organizationId,
        fact: fact({ actorId: 'pe-scoped', competitionId: 'se-2' }),
        ...AUDIT,
      });
    });

    const inScope = await tags.factsFor({
      organizationId,
      competitionGranularity: 'season',
      competitionId: 'se-2',
    });
    const elsewhere = await tags.factsFor({
      organizationId,
      competitionGranularity: 'season',
      competitionId: 'se-3',
    });

    expect(inScope.map((one) => one.actorId)).toEqual(['pe-scoped']);
    expect(elsewhere).toEqual([]);
  });

  it('exposes no way to refuse anything on account of a tag', () => {
    const tags = new TagRepository(scratch.db);
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(tags)).filter(
      (name) => name !== 'constructor',
    );

    // Record and read. A console that wants a suspended player kept out asks the
    // organizer; this repository has nothing to offer it.
    expect(surface.sort()).toEqual(['factsFor', 'record']);
  });
});
