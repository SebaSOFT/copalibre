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

  describe('winCondition as a rule script', () => {
    it('rejects the pre-0009 enumerated string', () => {
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

    it.each([
      ['an unknown kind', { kind: 'summon-var', delta: 1 }],
      ['a score with no recipient', { kind: 'score', delta: 1 }],
      ['a score awarding to nobody named', { kind: 'score', awardTo: 'referee', delta: 1 }],
      ['a statistic naming no code', { kind: 'statistic', delta: 1 }],
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
      // is what makes every module authored before 0071 stay valid forever.
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
});
