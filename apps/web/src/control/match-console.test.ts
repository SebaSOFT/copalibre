import { describe, expect, it } from '@jest/globals';
import {
  currentEpochMilliseconds,
  descriptionFor,
  formatClock,
  isEventPermitted,
  newIdempotencyKey,
  segmentLabel,
} from './lib/match-console.js';
import type { ConsoleEventDefinition, ConsoleSegment, MatchConsoleResponse } from './lib/api-client.js';

function definition(overrides: Partial<ConsoleEventDefinition> = {}): ConsoleEventDefinition {
  return {
    code: 'goal',
    label: 'Gol',
    category: 'positive',
    permittedSegmentTypes: ['half'],
    actorRequirement: 'side',
    payloadSchema: {},
    display: {},
    ...overrides,
  };
}

function segment(overrides: Partial<ConsoleSegment> = {}): ConsoleSegment {
  return {
    segmentId: 'segment-1',
    type: 'half',
    number: 1,
    state: 'active',
    elapsedSeconds: 0,
    ...overrides,
  };
}

describe('newIdempotencyKey', () => {
  it('produces a UUID-shaped, non-empty key', () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('produces a different key on every call', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe('currentEpochMilliseconds', () => {
  it('returns a positive integer close to Date.now()', () => {
    const before = Date.now();
    const value = currentEpochMilliseconds();
    const after = Date.now();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });
});

describe('formatClock', () => {
  it('formats zero seconds', () => {
    expect(formatClock(0)).toBe('00:00');
  });

  it('formats a sub-minute duration', () => {
    expect(formatClock(45)).toBe('00:45');
  });

  it('formats an hour-plus duration by rolling minutes past 59', () => {
    expect(formatClock(3_725)).toBe('62:05');
  });

  it('floors a fractional second value', () => {
    expect(formatClock(89.9)).toBe('01:29');
  });

  it('clamps a negative value to zero', () => {
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('descriptionFor', () => {
  it('returns undefined for blank input', () => {
    const def = definition({ payloadSchema: { properties: { description: {} } } });
    expect(descriptionFor(def, '   ')).toBeUndefined();
  });

  it('returns undefined when the definition does not declare a description field', () => {
    const def = definition({ payloadSchema: {} });
    expect(descriptionFor(def, 'Falta clara')).toBeUndefined();
  });

  it('returns the trimmed description when the definition declares the field', () => {
    const def = definition({ payloadSchema: { properties: { description: {} } } });
    expect(descriptionFor(def, '  Falta clara  ')).toBe('Falta clara');
  });
});

describe('segmentLabel', () => {
  const projection = {
    segments: [segment({ segmentId: 's1', type: 'half', number: 2 })],
  } as unknown as MatchConsoleResponse;

  it('labels a known segment by type and number', () => {
    expect(segmentLabel(projection, 's1')).toBe('half 2');
  });

  it('falls back for a segment id the projection does not carry', () => {
    expect(segmentLabel(projection, 'missing')).toBe('Segmento desconocido');
  });
});

describe('isEventPermitted', () => {
  const base = { entrantIds: ['e1'], eligiblePersonIds: [], eligibleStaffIds: [] };

  it('refuses every definition when there is no active segment', () => {
    expect(isEventPermitted(definition(), base, undefined)).toBe(false);
  });

  it('refuses a definition whose permitted segment types exclude the active segment', () => {
    const def = definition({ permittedSegmentTypes: ['extra-time'] });
    expect(isEventPermitted(def, base, segment({ type: 'half' }))).toBe(false);
  });

  it('permits a side-attributed definition once an entrant exists', () => {
    const def = definition({ actorRequirement: 'side' });
    expect(isEventPermitted(def, base, segment())).toBe(true);
    expect(isEventPermitted(def, { ...base, entrantIds: [] }, segment())).toBe(false);
  });

  it('permits a person-attributed definition only when an eligible person exists', () => {
    const def = definition({ actorRequirement: 'person' });
    expect(isEventPermitted(def, base, segment())).toBe(false);
    expect(isEventPermitted(def, { ...base, eligiblePersonIds: ['p1'] }, segment())).toBe(true);
  });

  it('permits a person-or-staff definition when either pool has an eligible actor', () => {
    const def = definition({ actorRequirement: 'person-or-staff' });
    expect(isEventPermitted(def, base, segment())).toBe(false);
    expect(isEventPermitted(def, { ...base, eligibleStaffIds: ['staff1'] }, segment())).toBe(true);
    expect(isEventPermitted(def, { ...base, eligiblePersonIds: ['p1'] }, segment())).toBe(true);
  });

  it('permits an unattributed definition whenever the segment matches', () => {
    const def = definition({ actorRequirement: 'none' });
    expect(isEventPermitted(def, { ...base, entrantIds: [] }, segment())).toBe(true);
  });
});
