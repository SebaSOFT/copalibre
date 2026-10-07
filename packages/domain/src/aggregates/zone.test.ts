import {
  IMPLICIT_ZONE_NAME,
  effectiveFormat,
  isImplicitZone,
  producesStandingsTable,
  validateZone,
  validateZoneFormat,
  type Zone,
} from './zone.js';

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

describe('a zone may play a different format from its stage', () => {
  const stage = { format: 'single-elimination' } as const;

  it('inherits the stage format when it declares none', () => {
    expect(effectiveFormat(zone(), stage)).toBe('single-elimination');
  });

  it('plays its own format when it declares one', () => {
    expect(effectiveFormat(zone({ format: 'round-robin' }), stage)).toBe('round-robin');
  });

  it('resolves each zone of one stage independently', () => {
    const zones = [
      zone({ zoneId: 'z-1' }),
      zone({ zoneId: 'z-2' }),
      zone({ format: 'round-robin' }),
    ];
    expect(zones.map((candidate) => effectiveFormat(candidate, stage))).toEqual([
      'single-elimination',
      'single-elimination',
      'round-robin',
    ]);
  });

  it('accepts a format the discipline offers', () => {
    const result = validateZoneFormat(zone(), 'round-robin', ['single-elimination', 'round-robin']);
    expect(result).toEqual({ ok: true, value: 'round-robin' });
  });

  it('refuses a format the discipline does not offer, naming what it does', () => {
    const result = validateZoneFormat(zone(), 'swiss', ['single-elimination', 'round-robin']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ZONE_INVALID');
    expect(result.error.message).toContain('single-elimination, round-robin');
  });

  it('refuses every format when the discipline offers none', () => {
    const result = validateZoneFormat(zone(), 'round-robin', []);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('(none)');
  });
});

describe('which zone formats are ranked in a standings table', () => {
  it.each(['single-elimination', 'double-elimination', 'gauntlet', 'custom-bracket'] as const)(
    'ranks nobody in a %s zone',
    (format) => {
      expect(producesStandingsTable(format)).toBe(false);
    },
  );

  it.each([
    'round-robin',
    'league',
    'round-robin-single-leg',
    'round-robin-home-away',
    'swiss',
    'bracket-groups',
    'ffa-league',
  ] as const)('ranks a %s zone', (format) => {
    expect(producesStandingsTable(format)).toBe(true);
  });
});
