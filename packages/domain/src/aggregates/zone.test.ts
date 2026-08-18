import { IMPLICIT_ZONE_NAME, isImplicitZone, validateZone, type Zone } from './zone.js';

function zone(overrides: Partial<Zone> = {}): Zone {
  return {
    zoneId: 'z-1',
    stageId: 'stage-1',
    number: 2,
    name: 'Zona Norte',
    ...overrides,
  };
}

describe('a zone is a partition of a stage', () => {
  it('accepts a zone with a name and a position in the sequence', () => {
    expect(validateZone(zone()).ok).toBe(true);
  });

  it('refuses a zone with no name', () => {
    const result = validateZone(zone({ name: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ZONE_INVALID');
  });

  it.each([[0], [-1], [1.5]])('refuses a number of %p', (number) => {
    expect(validateZone(zone({ number })).ok).toBe(false);
  });
});

describe('the implicit zone', () => {
  it('is what a stage with no declared partition carries', () => {
    expect(isImplicitZone({ name: IMPLICIT_ZONE_NAME, number: 1 })).toBe(true);
  });

  it('is not claimed by a zone somebody named', () => {
    expect(isImplicitZone({ name: 'Zona Norte', number: 1 })).toBe(false);
    expect(isImplicitZone({ name: IMPLICIT_ZONE_NAME, number: 2 })).toBe(false);
  });
});
