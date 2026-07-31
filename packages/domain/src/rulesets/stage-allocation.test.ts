import { ALLOCATION_MODES, assertSlotCount, validateAllocation } from './stage-allocation.js';

describe('validateAllocation', () => {
  it.each(ALLOCATION_MODES)('accepts the %s mode', (mode) => {
    const allocation =
      mode === 'weighted'
        ? ({ mode, attributeKey: 'ranking', direction: 'lower-first' } as const)
        : ({ mode } as const);

    expect(validateAllocation(allocation).ok).toBe(true);
  });

  it('rejects a mode nothing implements', () => {
    const result = validateAllocation({ mode: 'astrology' } as never);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('STAGE_ALLOCATION_INVALID');
    expect(result.error.message).toContain('astrology');
  });

  it('rejects weighted allocation with no attribute to rank on', () => {
    expect(
      validateAllocation({ mode: 'weighted', attributeKey: '   ', direction: 'higher-first' }).ok,
    ).toBe(false);
  });
});

describe('assertSlotCount', () => {
  it('accepts a field that fills the next stage exactly', () => {
    expect(assertSlotCount(8, 8).ok).toBe(true);
  });

  it.each([
    [9, 8],
    [7, 8],
  ])('rejects %i entrants for %i slots at configuration time', (advancing, slots) => {
    const result = assertSlotCount(advancing, slots);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({ advancing, slots });
  });
});
