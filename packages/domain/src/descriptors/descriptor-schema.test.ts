import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { validateDisciplineDescriptorDocument } from './descriptor-schema.js';

/** A descriptor arrives as JSON; the tests exercise it as JSON, not as a typed object. */
function asDocument(overrides: Record<string, unknown> = {}): unknown {
  const document = JSON.parse(JSON.stringify(fixtureDescriptor())) as Record<string, unknown>;
  delete document.descriptorId;
  return JSON.parse(JSON.stringify({ ...document, ...overrides })) as unknown;
}

describe('discipline descriptor schema', () => {
  it('accepts the reference descriptor', () => {
    const result = validateDisciplineDescriptorDocument(asDocument());
    expect(result.ok).toBe(true);
  });

  it('accepts an optional localized description and still accepts its absence', () => {
    expect(
      validateDisciplineDescriptorDocument(
        asDocument({ description: { en: 'Association football', es: 'Fútbol asociación' } }),
      ).ok,
    ).toBe(true);
    expect(validateDisciplineDescriptorDocument(asDocument()).ok).toBe(true);
  });

  it('accepts a descriptor declaring descriptions on a statistic, an event definition, a scoring input, an event-workflow option, and a format', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({
        statistics: [
          { code: 'points', label: 'Points', aggregation: 'sum', description: 'Match points' },
        ],
        eventDefinitions: [
          {
            code: 'goal',
            label: 'Goal',
            description: 'Awards one point to the scoring side',
            category: 'positive',
            permittedSegmentTypes: ['half'],
            actorRequirement: 'person',
            payloadSchema: { type: 'object', properties: {} },
            workflow: {
              kind: 'outcome-choice',
              options: [
                {
                  definitionCode: 'goal-confirmed',
                  label: 'Confirmed',
                  description: 'The goal stands and the score updates',
                },
              ],
            },
          },
          {
            code: 'goal-confirmed',
            label: 'Confirmed',
            category: 'neutral',
            permittedSegmentTypes: ['half'],
            actorRequirement: 'none',
            payloadSchema: { type: 'object', properties: {} },
          },
        ],
        scoringInputs: [
          { code: 'goals', label: 'Goals', source: 'event-derived', description: 'Goals scored' },
        ],
        formatDescriptions: { 'round-robin': 'Every entrant plays every other entrant once' },
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('accepts a descriptor declaring none of the new descriptions, unchanged', () => {
    const result = validateDisciplineDescriptorDocument(asDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statistics[0]?.description).toBeUndefined();
    expect(result.value.formatDescriptions).toBeUndefined();
  });

  it('accepts between one and ten optional object-storage image references', () => {
    expect(
      validateDisciplineDescriptorDocument(
        asDocument({ images: [{ key: 'modules/football/1.1.0/football-01.jpg' }] }),
      ).ok,
    ).toBe(true);
    expect(
      validateDisciplineDescriptorDocument(
        asDocument({
          images: Array.from({ length: 10 }, (_, index) => ({
            key: `modules/football/1.1.0/football-${String(index + 1).padStart(2, '0')}.jpg`,
          })),
        }),
      ).ok,
    ).toBe(true);
  });

  it('rejects empty, oversized, or malformed image reference arrays', () => {
    expect(validateDisciplineDescriptorDocument(asDocument({ images: [] })).ok).toBe(false);
    expect(
      validateDisciplineDescriptorDocument(
        asDocument({
          images: Array.from({ length: 11 }, (_, index) => ({ key: `image-${index}` })),
        }),
      ).ok,
    ).toBe(false);
    expect(
      validateDisciplineDescriptorDocument(asDocument({ images: [{ key: '', url: '/image.jpg' }] }))
        .ok,
    ).toBe(false);
  });

  it('rejects a document missing a required member', () => {
    const withoutStatistics = asDocument() as Record<string, unknown>;
    delete withoutStatistics.statistics;
    const result = validateDisciplineDescriptorDocument(withoutStatistics);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('DESCRIPTOR_VALIDATION_FAILED');
    expect(result.error.details?.field).toBe('statistics');
  });

  it('rejects an aggregation mode accounting cannot fold', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({ statistics: [{ code: 'strikes', label: 'Strikes', aggregation: 'median' }] }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('aggregation');
  });

  it('rejects an undeclared member on a statistic definition', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({
        statistics: [{ code: 'strikes', label: 'Strikes', aggregation: 'sum', derived: true }],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('derived');
    expect(result.error.details?.field).toBe('statistics.0');
  });

  it('rejects a duplicated statistic code, which would make fold order decide the table', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({
        statistics: [
          { code: 'points', label: 'Points', aggregation: 'sum' },
          { code: 'points', label: 'Puntos', aggregation: 'max' },
        ],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('more than once');
    expect(result.error.details?.code).toBe('points');
  });

  it('rejects a duplicated roster role code', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({
        rosterRoles: [
          { code: 'captain', label: 'Captain' },
          { code: 'captain', label: 'Capitán' },
        ],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('more than once');
    expect(result.error.details?.code).toBe('captain');
  });

  it('rejects a duplicated column code within one table', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({
        tableLayouts: [
          {
            code: 'group-standings-default',
            target: 'group-phase',
            label: { en: 'Group Standings' },
            entityGranularity: 'team',
            defaultSort: [{ columnCode: 'points', direction: 'desc' }],
            columns: [
              {
                code: 'points',
                header: { en: 'Points' },
                source: { kind: 'collector', code: 'points' },
                format: 'number',
              },
              {
                code: 'points',
                header: { en: 'Pts' },
                source: { kind: 'collector', code: 'points' },
                format: 'number',
              },
            ],
          },
        ],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('more than once');
    expect(result.error.details?.table).toBe('group-standings-default');
    expect(result.error.details?.code).toBe('points');
  });

  it('accepts the same column code reused across two different tables', () => {
    const column = {
      code: 'points',
      header: { en: 'Points' },
      source: { kind: 'collector', code: 'points' },
      format: 'number',
    };
    const result = validateDisciplineDescriptorDocument(
      asDocument({
        tableLayouts: [
          {
            code: 'group-standings',
            target: 'group-phase',
            label: { en: 'Group Standings' },
            entityGranularity: 'team',
            defaultSort: [{ columnCode: 'points', direction: 'desc' }],
            columns: [column],
          },
          {
            code: 'team-ranking-table',
            target: 'team-ranking',
            label: { en: 'Team Ranking' },
            entityGranularity: 'team',
            defaultSort: [{ columnCode: 'points', direction: 'desc' }],
            columns: [column],
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });

  describe('winCondition as a rule script', () => {
    it('rejects the previous enumerated string', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({ winCondition: 'higher-score-wins' }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details?.field).toBe('winCondition');
    });

    it('rejects a script without an id or rules', () => {
      const result = validateDisciplineDescriptorDocument(asDocument({ winCondition: {} }));
      expect(result.ok).toBe(false);
    });

    it('accepts a script naming actions, whose existence the registry vets separately', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({
          winCondition: {
            id: 'first-to-two-sets',
            rules: [
              {
                id: 'close-set',
                type: 'simple_rule',
                options: {},
                conditions: [],
                actions: [
                  {
                    id: 'set',
                    type: 'winSegment',
                    options: {},
                    params: [
                      {
                        id: 'target',
                        name: 'target',
                        type: 'simple_number',
                        value: 6,
                        options: {},
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      );

      expect(result.ok).toBe(true);
    });

    it.each([
      ['conditions', { id: 'r1', type: 'simple_rule', options: {}, actions: [] }],
      ['omits actions', { id: 'r1', type: 'simple_rule', options: {}, conditions: [] }],
    ])('rejects at installation a rule that omits %s', (_label, rule) => {
      // Neuron's validateScript demands both arrays. Accepting the document and
      // failing at evaluation would let a module install and break during a
      // match, which is the worst place to find out.
      const result = validateDisciplineDescriptorDocument(
        asDocument({ winCondition: { id: 'half-declared', rules: [rule] } }),
      );

      expect(result.ok).toBe(false);
    });

    it('accepts empty arrays, which mean "always" and "changes nothing"', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({
          winCondition: {
            id: 'degenerate',
            rules: [{ id: 'r1', type: 'simple_rule', options: {}, conditions: [], actions: [] }],
          },
        }),
      );

      expect(result.ok).toBe(true);
    });

    it('rejects a malformed rule inside an otherwise valid script', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({
          winCondition: { id: 'broken', rules: [{ type: 'simple_rule', options: {} }] },
        }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details?.field).toContain('winCondition.rules');
    });
  });

  describe('declared effects', () => {
    function withEffect(effect: unknown) {
      const base = fixtureDescriptor();
      const [first, ...rest] = base.eventDefinitions;
      return validateDisciplineDescriptorDocument(
        asDocument({ eventDefinitions: [{ ...first, effects: [effect] }, ...rest] }),
      );
    }

    it('accepts each declared kind', () => {
      expect(withEffect({ kind: 'score', awardTo: 'actor', delta: 1 }).ok).toBe(true);
      expect(withEffect({ kind: 'score', awardTo: 'every-other-side', delta: 1 }).ok).toBe(true);
      expect(withEffect({ kind: 'statistic', statisticCode: 'fouls', delta: 1 }).ok).toBe(true);
      expect(withEffect({ kind: 'timed-penalty', durationSeconds: 120, affects: 'actor' }).ok).toBe(
        true,
      );
      expect(withEffect({ kind: 'match-state', transition: 'finished' }).ok).toBe(true);
    });

    it('rejects the duel-only spelling a module could ship before this phase', () => {
      // `side: 'opponent'` installed happily while the schema said "an object":
      // in a heat it names nobody, and the engine would have had to guess.
      expect(withEffect({ kind: 'score', side: 'opponent', delta: 1 }).ok).toBe(false);
    });

    it('accepts a statistic effect declaring awardTo, in every shape', () => {
      expect(
        withEffect({ kind: 'statistic', statisticCode: 'fouls', delta: 1, awardTo: 'actor' }).ok,
      ).toBe(true);
      expect(
        withEffect({
          kind: 'statistic',
          statisticCode: 'goals-against',
          delta: 1,
          awardTo: 'every-other-side',
        }).ok,
      ).toBe(true);
      expect(
        withEffect({
          kind: 'statistic',
          statisticCode: 'assists',
          delta: 1,
          awardTo: { payloadField: 'assistedBy' },
        }).ok,
      ).toBe(true);
    });

    it('accepts a tag effect declaring target, but not every-other-side', () => {
      expect(withEffect({ kind: 'tag', tagCode: 'expelled', action: 'applied' }).ok).toBe(true);
      expect(
        withEffect({ kind: 'tag', tagCode: 'expelled', action: 'applied', target: 'actor' }).ok,
      ).toBe(true);
      expect(
        withEffect({
          kind: 'tag',
          tagCode: 'eliminated',
          action: 'applied',
          target: { payloadField: 'victimId' },
        }).ok,
      ).toBe(true);
    });

    it.each([
      ['an unknown kind', { kind: 'summon-var', delta: 1 }],
      ['a score with no recipient', { kind: 'score', delta: 1 }],
      ['a score awarding to nobody named', { kind: 'score', awardTo: 'referee', delta: 1 }],
      ['a statistic naming no code', { kind: 'statistic', delta: 1 }],
      [
        'a statistic awardTo naming an empty payload field',
        { kind: 'statistic', statisticCode: 'assists', delta: 1, awardTo: { payloadField: '' } },
      ],
      [
        'a statistic awardTo of every-other-side spelled as a payload object with an extra member',
        {
          kind: 'statistic',
          statisticCode: 'assists',
          delta: 1,
          awardTo: { payloadField: 'x', extra: 1 },
        },
      ],
      [
        'a tag target of every-other-side, which names no one actor',
        { kind: 'tag', tagCode: 'expelled', action: 'applied', target: 'every-other-side' },
      ],
      ['a penalty of no duration', { kind: 'timed-penalty', durationSeconds: 0, affects: 'side' }],
      ['a transition of no name', { kind: 'match-state', transition: '' }],
      ['an effect carrying an undeclared member', { kind: 'match-state', transition: 'x', y: 1 }],
    ])('rejects %s', (_label, effect) => {
      expect(withEffect(effect).ok).toBe(false);
    });
  });

  describe('declared collectors', () => {
    function withCollector(collector: unknown) {
      return validateDisciplineDescriptorDocument(asDocument({ collectors: [collector] }));
    }

    const goals = {
      code: 'goals',
      label: 'Goles',
      source: { kind: 'event', definitionCodes: ['strike'] },
      measure: { kind: 'count' },
      granularity: { actor: 'person', competition: 'match' },
    };

    it('accepts a descriptor declaring none, so every module written before them stays valid', () => {
      expect(validateDisciplineDescriptorDocument(asDocument()).ok).toBe(true);
    });

    it('accepts a collector over an event, per person per match', () => {
      expect(withCollector(goals).ok).toBe(true);
    });

    it('accepts each source kind', () => {
      for (const source of [
        { kind: 'event', categories: ['negative'] },
        { kind: 'statistic', statisticCode: 'strikes' },
        { kind: 'collector', code: 'goals' },
        { kind: 'participation', roles: ['player'] },
      ]) {
        expect(withCollector({ ...goals, source }).ok).toBe(true);
      }
    });

    it('accepts an event-sourced collector declaring actorSource, in every shape', () => {
      for (const actorSource of ['primary', 'every-other-side', { payloadField: 'victimId' }]) {
        expect(
          withCollector({
            ...goals,
            source: { kind: 'event', definitionCodes: ['strike'], actorSource },
          }).ok,
        ).toBe(true);
      }
    });

    it('rejects actorSource on a non-event source, and an empty payload field', () => {
      expect(
        withCollector({
          ...goals,
          source: { kind: 'statistic', statisticCode: 'strikes', actorSource: 'primary' },
        }).ok,
      ).toBe(false);
      expect(
        withCollector({
          ...goals,
          source: { kind: 'event', definitionCodes: ['strike'], actorSource: { payloadField: '' } },
        }).ok,
      ).toBe(false);
    });

    it('accepts a ceiling, and a measure over a field', () => {
      expect(
        withCollector({
          ...goals,
          measure: { kind: 'average', field: 'distanceMeters' },
          rollsUpTo: { competition: 'season' },
        }).ok,
      ).toBe(true);
    });

    it.each([
      [
        'an unpublished actor granularity',
        { ...goals, granularity: { actor: 'referee', competition: 'match' } },
      ],
      [
        'an unpublished competition granularity',
        { ...goals, granularity: { actor: 'person', competition: 'fortnight' } },
      ],
      [
        'the entrant as a granularity',
        { ...goals, granularity: { actor: 'entrant', competition: 'match' } },
      ],
      ['a measure over no field', { ...goals, measure: { kind: 'average' } }],
      ['an unknown measure', { ...goals, measure: { kind: 'median', field: 'x' } }],
      ['an unknown source kind', { ...goals, source: { kind: 'telepathy' } }],
      [
        'no granularity at all',
        { code: 'c', label: 'C', source: goals.source, measure: goals.measure },
      ],
      ['an undeclared member', { ...goals, resetOn: 'season' }],
    ])('rejects %s', (_label, collector) => {
      expect(withCollector(collector).ok).toBe(false);
    });

    it('rejects the reset field the first draft carried, since the granularity is the frequency', () => {
      // A reset loses information; a figure kept per period and summed upward
      // loses none, and that is what the granularity already says.
      expect(withCollector({ ...goals, resetOn: 'segment' }).ok).toBe(false);
    });

    describe('cadence', () => {
      it('accepts a descriptor declaring none, absent reading as on-finalize', () => {
        expect(withCollector(goals).ok).toBe(true);
      });

      it.each(['on-finalize', 'live'])('accepts a declared "%s" cadence', (kind) => {
        expect(withCollector({ ...goals, cadence: { kind } }).ok).toBe(true);
      });

      it('rejects an unknown cadence kind', () => {
        expect(withCollector({ ...goals, cadence: { kind: 'hourly' } }).ok).toBe(false);
      });

      it('rejects a cadence carrying an undeclared member', () => {
        expect(withCollector({ ...goals, cadence: { kind: 'live', every: 1 } }).ok).toBe(false);
      });
    });
  });

  it('rejects a format outside the MVP list', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({ availableFormats: ['swiss'] }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a non-object document', () => {
    expect(validateDisciplineDescriptorDocument('a descriptor').ok).toBe(false);
  });

  describe('localized labels', () => {
    it('still accepts a plain-string label and name, unmodified', () => {
      // The reference descriptor already uses plain strings throughout; this
      // is what keeps every previously authored module valid forever.
      expect(validateDisciplineDescriptorDocument(asDocument()).ok).toBe(true);
    });

    it('accepts a locale-map label requiring only en', () => {
      const result = validateDisciplineDescriptorDocument(asDocument({ name: { en: 'Football' } }));
      expect(result.ok).toBe(true);
    });

    it('accepts a locale-map label with additional supported languages', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({
          statistics: [
            { code: 'strikes', label: { en: 'Strikes', es: 'Golpes' }, aggregation: 'sum' },
          ],
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('rejects a locale-map label missing the required en key', () => {
      const result = validateDisciplineDescriptorDocument(asDocument({ name: { es: 'Fútbol' } }));
      expect(result.ok).toBe(false);
    });

    it('rejects a locale-map label with an unsupported language key', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({ name: { en: 'Football', xx: 'Nope' } }),
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('series declaration', () => {
    it('accepts a valid best-of series declaration', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({
          series: { span: 5, resolutionClass: 'best-of', neutralGround: false },
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('accepts a valid aggregate series declaration', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({
          series: { span: 2, resolutionClass: 'aggregate' },
        }),
      );
      expect(result.ok).toBe(true);
    });

    it('refuses a declaration naming both a class and a script and names the offending field', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({
          series: {
            span: 5,
            resolutionClass: 'best-of',
            resolutionScript: { id: 'custom-series', rules: [] },
          },
        }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details?.field).toBe('series.resolutionScript');
      expect(result.error.message).toContain('both a resolution class and a resolution script');
    });

    it('refuses an even-span best-of and names the offending field', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({
          series: { span: 4, resolutionClass: 'best-of' },
        }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details?.field).toBe('series.span');
      expect(result.error.message).toContain('odd span');
    });

    it('refuses a series with span less than 2', () => {
      const result = validateDisciplineDescriptorDocument(
        asDocument({
          series: { span: 1, resolutionClass: 'best-of' },
        }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details?.field).toBe('series.span');
    });
  });
});
