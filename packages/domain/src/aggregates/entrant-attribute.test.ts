import type { Entrant } from './participant.js';
import {
  assertWeightingComplete,
  attributeValue,
  categoricalAttribute,
  numericAttribute,
  validateAttributes,
  type EntrantAttribute,
} from './entrant-attribute.js';

const ranking: EntrantAttribute = { key: 'ranking', value: 12, kind: 'numeric' };
const region: EntrantAttribute = { key: 'region', value: 'san-juan', kind: 'categorical' };

const entrant = (entrantId: string): Entrant => ({
  entrantId,
  tournamentId: 't-1',
  entrantRef: { kind: 'team', teamId: `team-${entrantId}` },
  status: 'accepted',
});

describe('validateAttributes', () => {
  it('accepts a numeric and a categorical attribute on one entrant', () => {
    expect(validateAttributes({ entrantId: 'e1', attributes: [ranking, region] }).ok).toBe(true);
  });

  it('accepts an entrant carrying none', () => {
    expect(validateAttributes({ entrantId: 'e1', attributes: [] }).ok).toBe(true);
  });

  it('rejects a numeric attribute whose value is a string', () => {
    const result = validateAttributes({
      entrantId: 'e1',
      attributes: [{ key: 'ranking', value: '12th', kind: 'numeric' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ENTRANT_ATTRIBUTE_INVALID');
    expect(result.error.message).toContain('ranking');
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY]])(
    'rejects a non-finite numeric value (%p)',
    (value) => {
      const result = validateAttributes({
        entrantId: 'e1',
        attributes: [{ key: 'ranking', value, kind: 'numeric' }],
      });
      expect(result.ok).toBe(false);
    },
  );

  it('rejects a categorical attribute carrying a number, which would sort wrongly', () => {
    const result = validateAttributes({
      entrantId: 'e1',
      attributes: [{ key: 'region', value: 5, kind: 'categorical' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('categorical');
  });

  it('rejects the same key twice', () => {
    const result = validateAttributes({
      entrantId: 'e1',
      attributes: [ranking, { key: 'ranking', value: 3, kind: 'numeric' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details?.key).toBe('ranking');
  });

  it('rejects an empty key', () => {
    expect(
      validateAttributes({
        entrantId: 'e1',
        attributes: [{ key: '  ', value: 'x', kind: 'categorical' }],
      }).ok,
    ).toBe(false);
  });
});

describe('reading attributes', () => {
  const attributes = [ranking, region];

  it('reads by key regardless of kind', () => {
    expect(attributeValue(attributes, 'ranking')).toBe(12);
    expect(attributeValue(attributes, 'region')).toBe('san-juan');
    expect(attributeValue(attributes, 'absent')).toBeUndefined();
  });

  it('narrows by kind, ignoring a value of the wrong type', () => {
    expect(numericAttribute(attributes, 'ranking')).toBe(12);
    expect(numericAttribute(attributes, 'region')).toBeUndefined();
    expect(categoricalAttribute(attributes, 'region')).toBe('san-juan');
    expect(categoricalAttribute(attributes, 'ranking')).toBeUndefined();
  });
});

describe('assertWeightingComplete', () => {
  const entrants = [entrant('e1'), entrant('e2'), entrant('e3')];

  it('passes when every entrant carries the weighting attribute', () => {
    const byEntrant = new Map(entrants.map((e) => [e.entrantId, [ranking]]));
    expect(assertWeightingComplete(entrants, byEntrant, 'ranking').ok).toBe(true);
  });

  it('names every entrant missing it rather than seeding half the field', () => {
    const byEntrant = new Map<string, readonly EntrantAttribute[]>([
      ['e1', [ranking]],
      ['e2', [region]],
    ]);

    const result = assertWeightingComplete(entrants, byEntrant, 'ranking');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details?.missing).toEqual(['e2', 'e3']);
    expect(result.error.message).toContain('2 do not');
  });
});
