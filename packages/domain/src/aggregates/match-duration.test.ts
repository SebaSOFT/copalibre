import type { SegmentTypeDefinition } from '../descriptors/discipline-descriptor.js';
import { estimatedMatchMinutes } from './match-duration.js';

const discipline = (
  segmentTypes: readonly SegmentTypeDefinition[],
  segments?: Readonly<Record<string, unknown>>,
) => ({ segmentTypes, defaults: segments === undefined ? {} : { segments } });

const half = (seconds?: number): SegmentTypeDefinition => ({
  name: 'half',
  label: 'Half',
  timed: true,
  ...(seconds === undefined ? {} : { defaultDurationSeconds: seconds }),
});
const extraTime: SegmentTypeDefinition = {
  name: 'extra-time',
  label: 'Extra time',
  timed: true,
  defaultDurationSeconds: 900,
};

describe('estimatedMatchMinutes', () => {
  it('multiplies the regulation segment by the regulation count (football shape)', () => {
    expect(estimatedMatchMinutes(discipline([half(2700), extraTime], { regulationCount: 2 }))).toBe(
      90,
    );
  });

  it('leaves conditional segments out (rink-hockey shape)', () => {
    expect(estimatedMatchMinutes(discipline([half(1500), extraTime], { regulationCount: 2 }))).toBe(
      50,
    );
  });

  it('reads the regulation count from the tournament ruleset override first', () => {
    expect(
      estimatedMatchMinutes(discipline([half(600)], { regulationCount: 2 }), {
        segments: { regulationCount: 4, overtimeEnabled: true },
      }),
    ).toBe(40);
  });

  it('has no estimate for a discipline played to sets (tennis shape)', () => {
    expect(
      estimatedMatchMinutes(
        discipline([{ name: 'set', label: 'Set', timed: false }], { bestOf: 3 }),
      ),
    ).toBeUndefined();
  });

  it('has no estimate for a timed segment without a duration (dota-2 shape)', () => {
    expect(
      estimatedMatchMinutes(
        discipline([{ name: 'game', label: 'Game', timed: true }], { regulationCount: 1 }),
      ),
    ).toBeUndefined();
  });

  it('has no estimate without a regulation count', () => {
    expect(estimatedMatchMinutes(discipline([half(2700)]))).toBeUndefined();
  });
});
