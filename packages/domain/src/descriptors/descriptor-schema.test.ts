import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { validateDisciplineDescriptorDocument } from './descriptor-schema.js';

/** A descriptor arrives as JSON; the tests exercise it as JSON, not as a typed object. */
function asDocument(overrides: Record<string, unknown> = {}): unknown {
  return JSON.parse(JSON.stringify({ ...fixtureDescriptor(), ...overrides })) as unknown;
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
      // match, which is the worst place to find out (0013).
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

  it('rejects a format outside the MVP list', () => {
    const result = validateDisciplineDescriptorDocument(
      asDocument({ availableFormats: ['swiss'] }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a non-object document', () => {
    expect(validateDisciplineDescriptorDocument('a descriptor').ok).toBe(false);
  });
});
