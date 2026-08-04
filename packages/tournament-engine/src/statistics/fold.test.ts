import type { EventDefinition, RecordedEvent, StatisticCollector } from '@copalibre/domain';
import {
  aggregateTo,
  contributorsOf,
  foldStatistics,
  type ActorContext,
  type CollectedFigure,
} from './fold.js';

/**
 * One club, two people, one match — enough to prove that a team figure and a
 * person figure come from the same pass rather than from two folds that could
 * disagree.
 */

const CONTEXT = {
  matchId: 'm-1',
  stageId: 'st-1',
  seasonId: 'se-1',
  tournamentId: 't-1',
  organizationId: 'org-1',
};

const ATLAS: ActorContext = {
  personId: 'pe-1',
  playerId: 'pl-1',
  teamId: 'tm-atlas',
  clubId: 'cl-atlas',
};
const BOCA: ActorContext = {
  personId: 'pe-2',
  playerId: 'pl-2',
  teamId: 'tm-boca',
  clubId: 'cl-boca',
};

const actorOf = (entrantId: string): ActorContext | undefined =>
  entrantId === 'en-atlas' ? ATLAS : entrantId === 'en-boca' ? BOCA : undefined;

function event(overrides: Partial<RecordedEvent> & { sequence: number }): RecordedEvent {
  return {
    eventId: `e-${overrides.sequence}`,
    matchId: 'm-1',
    segmentId: 'seg-1',
    definitionCode: 'goal',
    occurredAt: '2026-08-01T20:00:00.000Z',
    payload: {},
    ...overrides,
  };
}

function collector(overrides: Partial<StatisticCollector> = {}): StatisticCollector {
  return {
    code: 'goals',
    label: 'Goles',
    source: { kind: 'event', definitionCodes: ['goal'] },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
    ...overrides,
  };
}

function fold(overrides: Partial<Parameters<typeof foldStatistics>[0]> = {}) {
  return foldStatistics({
    collectors: [collector()],
    events: [],
    roster: [],
    actorOf,
    context: CONTEXT,
    ...overrides,
  });
}

describe('one pass, both axes', () => {
  it('credits the person who caused a fact and the side it belongs to, from one fold', () => {
    const figures = fold({
      collectors: [
        collector(),
        collector({ code: 'team-goals', granularity: { actor: 'team', competition: 'match' } }),
      ],
      events: [event({ sequence: 1, side: 'en-atlas', personId: 'pe-1' })],
    });

    expect(figures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collectorCode: 'goals', actorId: 'pe-1', value: 1 }),
        expect.objectContaining({ collectorCode: 'team-goals', actorId: 'tm-atlas', value: 1 }),
      ]),
    );
  });

  it('counts each fact once per collector, whatever the arity of the match', () => {
    const figures = fold({
      events: [
        event({ sequence: 1, side: 'en-atlas', personId: 'pe-1' }),
        event({ sequence: 2, side: 'en-atlas', personId: 'pe-1' }),
        event({ sequence: 3, side: 'en-boca', personId: 'pe-2' }),
      ],
    });

    expect(figures.find((f) => f.actorId === 'pe-1')?.value).toBe(2);
    expect(figures.find((f) => f.actorId === 'pe-2')?.value).toBe(1);
  });

  it('ignores an event the collector does not watch', () => {
    expect(
      fold({ events: [event({ sequence: 1, definitionCode: 'foul', side: 'en-atlas' })] }),
    ).toEqual([]);
  });

  it('sums a measured field rather than counting occurrences', () => {
    const figures = fold({
      collectors: [
        collector({ code: 'metres', measure: { kind: 'sum', field: 'distanceMeters' } }),
      ],
      events: [
        event({ sequence: 1, side: 'en-atlas', personId: 'pe-1', payload: { distanceMeters: 12 } }),
        event({ sequence: 2, side: 'en-atlas', personId: 'pe-1', payload: { distanceMeters: 8 } }),
      ],
    });

    expect(figures[0]?.value).toBe(20);
    expect(figures[0]?.samples).toBe(2);
  });

  it('keeps a figure per segment when that is the declared granularity', () => {
    const figures = fold({
      collectors: [collector({ granularity: { actor: 'team', competition: 'segment' } })],
      events: [event({ sequence: 1, side: 'en-atlas' })],
    });

    expect(figures[0]?.competitionGranularity).toBe('segment');
  });
});

describe('an appearance is not an event', () => {
  it('counts a player who took the field and touched nothing', () => {
    const figures = fold({
      collectors: [
        collector({
          code: 'played',
          source: { kind: 'participation' },
          measure: { kind: 'count' },
        }),
      ],
      roster: [
        { ...ATLAS, role: 'player' },
        { ...BOCA, role: 'player' },
      ],
    });

    expect(figures).toHaveLength(2);
    expect(figures.every((figure) => figure.value === 1)).toBe(true);
  });

  it('counts only the roles the collector names', () => {
    const figures = fold({
      collectors: [
        collector({ code: 'played', source: { kind: 'participation', roles: ['player'] } }),
      ],
      roster: [
        { ...ATLAS, role: 'player' },
        { ...BOCA, role: 'coach' },
      ],
    });

    expect(figures.map((figure) => figure.actorId)).toEqual(['pe-1']);
  });
});

describe('a number moved by hand is still a fold', () => {
  it('applies a recorded adjustment like any other fact', () => {
    const figures = fold({
      events: [event({ sequence: 1, side: 'en-atlas', personId: 'pe-1' })],
      adjustments: [
        {
          collectorCode: 'goals',
          actorGranularity: 'person',
          actorId: 'pe-1',
          delta: -1,
          reason: 'Scoresheet reconciled with the referee report',
          actor: 'user:table-official-1',
        },
      ],
    });

    // The fact and the correction both come from the log, so re-folding gives
    // the same answer rather than an increment nobody can reproduce.
    expect(figures[0]?.value).toBe(0);
  });

  it('ignores an adjustment naming a collector nobody declared', () => {
    const figures = fold({
      adjustments: [
        {
          collectorCode: 'ghost',
          actorGranularity: 'person',
          actorId: 'pe-1',
          delta: 5,
          reason: 'x',
          actor: 'user:1',
        },
      ],
    });

    expect(figures).toEqual([]);
  });
});

describe('aggregating to a coarser granularity', () => {
  const base: CollectedFigure = {
    collectorCode: 'goals',
    actorGranularity: 'person',
    actorId: 'pe-1',
    competitionGranularity: 'match',
    competitionId: 'm-1',
    value: 2,
    samples: 2,
  };

  const perPerson: readonly CollectedFigure[] = [
    {
      collectorCode: 'goals',
      actorGranularity: 'person',
      actorId: 'pe-1',
      competitionGranularity: 'match',
      competitionId: 'm-1',
      value: 2,
      samples: 2,
    },
    {
      collectorCode: 'goals',
      actorGranularity: 'person',
      actorId: 'pe-3',
      competitionGranularity: 'match',
      competitionId: 'm-1',
      value: 4,
      samples: 4,
    },
  ];

  const toTeam = () => 'tm-atlas';

  it('adds counts and sums', () => {
    const [team] = aggregateTo(
      perPerson,
      { kind: 'count' },
      { actor: 'team' },
      { actorAt: toTeam },
    );

    expect(team?.value).toBe(6);
    expect(team?.actorId).toBe('tm-atlas');
  });

  it('takes the extreme for a maximum, rather than adding', () => {
    const [team] = aggregateTo(
      perPerson,
      { kind: 'max', field: 'x' },
      { actor: 'team' },
      { actorAt: toTeam },
    );

    expect(team?.value).toBe(4);
  });

  it('takes the extreme for a minimum too', () => {
    const [team] = aggregateTo(
      perPerson,
      { kind: 'min', field: 'x' },
      { actor: 'team' },
      {
        actorAt: toTeam,
      },
    );

    expect(team?.value).toBe(2);
  });

  it('recomputes an average from the samples, because the mean of means is not the mean', () => {
    const unequal: readonly CollectedFigure[] = [
      { ...base, value: 10, samples: 1 },
      { ...base, actorId: 'pe-3', value: 2, samples: 9 },
    ];

    const [team] = aggregateTo(
      unequal,
      { kind: 'average', field: 'x' },
      { actor: 'team' },
      { actorAt: toTeam },
    );

    // The mean of the means would be 6. Weighted by what each was computed
    // from, it is 2.8 — and only one of those is the average.
    expect(team?.value).toBeCloseTo(2.8, 5);
    expect(team?.samples).toBe(10);
  });

  it('refuses to aggregate downward, which would invent detail nothing carries', () => {
    expect(aggregateTo(perPerson, { kind: 'count' }, { actor: 'person' }, {})).toHaveLength(2);

    const coarse: readonly CollectedFigure[] = [
      { ...base, actorGranularity: 'club', actorId: 'cl-atlas' },
    ];
    expect(
      aggregateTo(coarse, { kind: 'count' }, { actor: 'person' }, { actorAt: () => 'pe-1' }),
    ).toEqual([]);
  });
});

describe('where a figure is filed on each axis', () => {
  it.each([
    ['event', 'm-1'],
    ['segment', 'm-1'],
    ['match', 'm-1'],
    ['stage', 'st-1'],
    ['season', 'se-1'],
    ['tournament', 't-1'],
    ['organization', 'org-1'],
  ] as const)('files a %s figure under %s', (competition, expected) => {
    const figures = fold({
      collectors: [collector({ granularity: { actor: 'person', competition } })],
      events: [event({ sequence: 1, side: 'en-atlas', personId: 'pe-1' })],
    });

    expect(figures[0]?.competitionId).toBe(expected);
  });

  it.each([
    ['person', 'pe-1'],
    ['player', 'pl-1'],
    ['team', 'tm-atlas'],
    ['club', 'cl-atlas'],
  ] as const)('files a %s figure under %s', (actor, expected) => {
    const figures = fold({
      collectors: [collector({ granularity: { actor, competition: 'match' } })],
      events: [event({ sequence: 1, side: 'en-atlas', personId: 'pe-1' })],
    });

    expect(figures[0]?.actorId).toBe(expected);
  });

  it('drops a fact whose actor cannot be resolved at the declared granularity', () => {
    // A person nobody enlisted has no player, team or club to be filed under,
    // and inventing one would attribute a fact to a side that never fielded them.
    const figures = fold({
      collectors: [collector({ granularity: { actor: 'club', competition: 'match' } })],
      events: [event({ sequence: 1, personId: 'pe-unknown' })],
    });

    expect(figures).toEqual([]);
  });

  it('drops a fact naming an entrant the caller cannot resolve', () => {
    expect(fold({ events: [event({ sequence: 1, side: 'en-ghost' })] })).toEqual([]);
  });

  it('attributes a fact to the person it names, over the side that produced it', () => {
    const figures = fold({
      events: [event({ sequence: 1, side: 'en-atlas', personId: 'pe-9' })],
    });

    expect(figures[0]?.actorId).toBe('pe-9');
  });
});

describe('a declared effect moves the same total a count would', () => {
  const definitions = [
    {
      code: 'goal',
      label: 'Gol',
      category: 'scoring',
      actorRequirement: 'optional',
      payloadSchema: { type: 'object' },
      effects: [{ kind: 'statistic', statisticCode: 'points', delta: 3 }],
    },
    {
      code: 'own-goal',
      label: 'Gol en contra',
      category: 'scoring',
      actorRequirement: 'optional',
      payloadSchema: { type: 'object' },
      effects: [{ kind: 'statistic', statisticCode: 'points', delta: -1 }],
    },
  ] as unknown as readonly EventDefinition[];

  const points = collector({
    code: 'points',
    source: { kind: 'statistic', statisticCode: 'points' },
    granularity: { actor: 'team', competition: 'match' },
  });

  it('applies the delta the discipline declared, not one per occurrence', () => {
    const figures = fold({
      collectors: [points],
      definitions,
      events: [event({ sequence: 1, side: 'en-atlas' })],
    });

    expect(figures[0]).toMatchObject({ actorId: 'tm-atlas', value: 3 });
  });

  it('applies a negative delta as declared', () => {
    const figures = fold({
      collectors: [points],
      definitions,
      events: [
        event({ sequence: 1, side: 'en-atlas' }),
        event({ sequence: 2, definitionCode: 'own-goal', side: 'en-atlas' }),
      ],
    });

    expect(figures[0]?.value).toBe(2);
  });

  it('counts an occurrence and reads a declared delta separately, so nothing is counted twice', () => {
    const figures = fold({
      collectors: [points, collector({ granularity: { actor: 'team', competition: 'match' } })],
      definitions,
      events: [event({ sequence: 1, side: 'en-atlas' })],
    });

    expect(figures.find((f) => f.collectorCode === 'points')?.value).toBe(3);
    expect(figures.find((f) => f.collectorCode === 'goals')?.value).toBe(1);
  });

  it('collects nothing from a declaration the caller did not supply', () => {
    expect(
      fold({ collectors: [points], events: [event({ sequence: 1, side: 'en-atlas' })] }),
    ).toEqual([]);
  });
});

describe('contributors', () => {
  it('lists the per-person rows the side total was folded from', () => {
    const figures = fold({
      collectors: [
        collector(),
        collector({ code: 'fouls', source: { kind: 'event', definitionCodes: ['foul'] } }),
      ],
      events: [
        event({ sequence: 1, side: 'en-atlas', personId: 'pe-1' }),
        event({ sequence: 2, definitionCode: 'foul', side: 'en-atlas', personId: 'pe-1' }),
        event({ sequence: 3, side: 'en-boca', personId: 'pe-2' }),
      ],
    });

    expect(contributorsOf(figures, 'person')).toEqual([
      { actorGranularity: 'person', actorId: 'pe-1', statistics: { goals: 1, fouls: 1 } },
      { actorGranularity: 'person', actorId: 'pe-2', statistics: { goals: 1 } },
    ]);
  });

  it('ignores figures kept at another granularity, which are not contributions', () => {
    const figures = fold({
      collectors: [collector({ granularity: { actor: 'team', competition: 'match' } })],
      events: [event({ sequence: 1, side: 'en-atlas', personId: 'pe-1' })],
    });

    expect(contributorsOf(figures, 'person')).toEqual([]);
  });
});

describe('what accumulates together, and what accumulates nowhere', () => {
  it('adds two event codes named by one collector', () => {
    // "En césped se acumulan las verdes y las amarillas": one collector, two
    // codes, one number — and no code decides that on its own.
    const figures = fold({
      collectors: [
        collector({
          code: 'cards',
          source: { kind: 'event', definitionCodes: ['green', 'yellow'] },
        }),
      ],
      events: [
        event({ sequence: 1, definitionCode: 'green', personId: 'pe-1' }),
        event({ sequence: 2, definitionCode: 'yellow', personId: 'pe-1' }),
      ],
    });

    expect(figures[0]?.value).toBe(2);
  });

  it('accumulates a code no collector names nowhere at all', () => {
    // "En hockey sobre patín las amarillas no se acumulan si hay azules": the
    // discipline says so by not declaring a collector over them.
    const figures = fold({
      collectors: [
        collector({ code: 'blue', source: { kind: 'event', definitionCodes: ['blue'] } }),
      ],
      events: [
        event({ sequence: 1, definitionCode: 'yellow', personId: 'pe-1' }),
        event({ sequence: 2, definitionCode: 'blue', personId: 'pe-1' }),
      ],
    });

    expect(figures).toHaveLength(1);
    expect(figures[0]?.collectorCode).toBe('blue');
  });
});

describe('a finer figure and a coarser one coexist', () => {
  it('keeps one row per period and derives the match figure from them', () => {
    const perPeriod = fold({
      collectors: [collector({ granularity: { actor: 'team', competition: 'segment' } })],
      events: [event({ sequence: 1, side: 'en-atlas' }), event({ sequence: 2, side: 'en-atlas' })],
    });

    const perMatch = aggregateTo(
      perPeriod,
      { kind: 'count' },
      { competition: 'match' },
      {
        competitionAt: () => 'm-1',
      },
    );

    // "Restarts each period" is one row per period, never a lost count: the
    // finer rows survive and the coarser one is their sum.
    expect(perPeriod[0]?.competitionGranularity).toBe('segment');
    expect(perMatch[0]?.value).toBe(2);
    expect(perPeriod).toHaveLength(1);
  });

  it('reports the sums of the granularity below at each step of the actor axis', () => {
    const perPerson = fold({
      events: [
        event({ sequence: 1, side: 'en-atlas', personId: 'pe-1' }),
        event({ sequence: 2, side: 'en-atlas', personId: 'pe-2' }),
      ],
    });

    const toTeam = aggregateTo(
      perPerson,
      { kind: 'count' },
      { actor: 'team' },
      {
        actorAt: () => 'tm-atlas',
      },
    );
    const toClub = aggregateTo(
      toTeam,
      { kind: 'count' },
      { actor: 'club' },
      {
        actorAt: () => 'cl-atlas',
      },
    );

    expect(perPerson).toHaveLength(2);
    expect(toTeam[0]?.value).toBe(2);
    expect(toClub[0]?.value).toBe(2);
  });
});

describe('a declared delta and a hand adjustment both reproduce on a replay', () => {
  const definitions = [
    {
      code: 'goal',
      label: 'Gol',
      category: 'scoring',
      actorRequirement: 'optional',
      payloadSchema: { type: 'object' },
      effects: [{ kind: 'statistic', statisticCode: 'points', delta: 3 }],
    },
  ] as unknown as readonly EventDefinition[];

  const input = {
    collectors: [
      collector({
        code: 'points',
        source: { kind: 'statistic', statisticCode: 'points' },
        granularity: { actor: 'team', competition: 'match' },
      }),
    ],
    definitions,
    events: [event({ sequence: 1, side: 'en-atlas' })],
    adjustments: [
      {
        collectorCode: 'points',
        actorGranularity: 'team' as const,
        actorId: 'tm-atlas',
        delta: -1,
        reason: 'Punto descontado por informe',
        actor: 'user:table-official-1',
      },
    ],
  };

  it('moves the total by both, and gives the same answer folded twice', () => {
    const first = fold(input);
    const second = fold(input);

    expect(first[0]?.value).toBe(2);
    // Neither is an increment against a stored number, so recomputation is the
    // mechanism rather than the thing that would erase them.
    expect(second).toEqual(first);
  });
});
