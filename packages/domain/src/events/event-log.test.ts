import type { Segment } from '../aggregates/competition.js';
import { EventValidationError } from '../errors.js';
import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { EventLog, effectsOf, type RecordEventInput } from './event-log.js';

const half: Segment = {
  segmentId: 'seg-1',
  matchId: 'm-1',
  type: 'half',
  number: 1,
  state: 'active',
};

const overtime: Segment = { ...half, segmentId: 'seg-2', type: 'overtime', number: 3 };

function strikeInput(overrides?: Partial<RecordEventInput>): RecordEventInput {
  return {
    eventId: 'e-1',
    matchId: 'm-1',
    segment: half,
    definitionCode: 'strike',
    occurredAt: '2026-07-29T12:00:00.000Z',
    participantId: 'p-9',
    payload: { zone: 'inner' },
    ...overrides,
  };
}

describe('EventLog', () => {
  it('records a valid event and assigns a monotonic sequence', () => {
    const log = new EventLog(fixtureDescriptor());
    const first = log.record(strikeInput({ eventId: 'e-1' }));
    const second = log.record(strikeInput({ eventId: 'e-2', payload: { zone: 'outer' } }));
    expect(first.ok && first.value.sequence).toBe(1);
    expect(second.ok && second.value.sequence).toBe(2);
    expect(log.list()).toHaveLength(2);
  });

  it('rejects an unknown event definition', () => {
    const log = new EventLog(fixtureDescriptor());
    const result = log.record(strikeInput({ definitionCode: 'teleport' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(EventValidationError);
    }
  });

  it('rejects an event recorded during a segment type it does not permit', () => {
    const log = new EventLog(fixtureDescriptor());
    // "caution" is only permitted during "half".
    const result = log.record(
      strikeInput({ definitionCode: 'caution', segment: overtime, payload: { reason: 'x' } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('overtime');
    }
  });

  it('rejects a payload missing a required field', () => {
    const log = new EventLog(fixtureDescriptor());
    const result = log.record(strikeInput({ payload: {} }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.field).toBe('zone');
    }
  });

  it('rejects a payload field with the wrong type', () => {
    const log = new EventLog(fixtureDescriptor());
    const result = log.record(strikeInput({ payload: { zone: 'inner', distanceMeters: 'far' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.field).toBe('distanceMeters');
    }
  });

  it('rejects an enum payload value outside its declared values', () => {
    const log = new EventLog(fixtureDescriptor());
    const result = log.record(strikeInput({ payload: { zone: 'stratosphere' } }));
    expect(result.ok).toBe(false);
  });

  it('rejects undeclared payload fields', () => {
    const log = new EventLog(fixtureDescriptor());
    const result = log.record(strikeInput({ payload: { zone: 'inner', smuggled: true } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.field).toBe('smuggled');
    }
  });

  it('rejects a missing actor when the definition requires one', () => {
    const log = new EventLog(fixtureDescriptor());
    const result = log.record(strikeInput({ participantId: undefined }));
    expect(result.ok).toBe(false);
  });

  it('accepts an actorless event when the definition requires none', () => {
    const log = new EventLog(fixtureDescriptor());
    const result = log.record(
      strikeInput({ definitionCode: 'pause', participantId: undefined, payload: {} }),
    );
    expect(result.ok).toBe(true);
  });

  it('exposes an append-only view — mutating the list does not alter the log', () => {
    const log = new EventLog(fixtureDescriptor());
    log.record(strikeInput());
    const view = log.list() as unknown[];
    view.pop();
    expect(log.list()).toHaveLength(1);
    expect(Object.isFrozen(log.list()[0])).toBe(true);
  });
});

describe('effectsOf', () => {
  it('returns only explicitly configured effects', () => {
    const descriptor = fixtureDescriptor();
    const log = new EventLog(descriptor);
    const recorded = log.record(strikeInput());
    expect(recorded.ok).toBe(true);
    if (recorded.ok) {
      expect(effectsOf(descriptor, recorded.value)).toEqual([
        { kind: 'score', side: 'actor', delta: 1 },
      ]);
    }
  });

  it('a negative-category event with no configured effects changes nothing', () => {
    const descriptor = fixtureDescriptor();
    const log = new EventLog(descriptor);
    const recorded = log.record(
      strikeInput({ definitionCode: 'caution', payload: { reason: 'dissent' } }),
    );
    expect(recorded.ok).toBe(true);
    if (recorded.ok) {
      expect(effectsOf(descriptor, recorded.value)).toEqual([]);
    }
  });
});

describe('invalid payload schema in a descriptor', () => {
  it('rejects recording with a typed error instead of throwing', () => {
    const base = fixtureDescriptor();
    const descriptor = fixtureDescriptor({
      eventDefinitions: [
        ...base.eventDefinitions,
        {
          code: 'broken',
          label: 'Broken Schema',
          category: 'neutral',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'none',
          // type must be a string/array in JSON Schema — 42 is invalid.
          payloadSchema: { type: 42 as unknown as string },
        },
      ],
    });
    const log = new EventLog(descriptor);
    const result = log.record(strikeInput({ definitionCode: 'broken', payload: {} }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('invalid payload JSON Schema');
    }
  });
});
