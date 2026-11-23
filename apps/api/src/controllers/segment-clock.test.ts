import { footballDescriptor, tennisDescriptor } from '@copalibre/domain';
import { clockChangedPayloadOf, elapsedSecondsOf, publicClockOf } from './segment-clock.js';

const NOW = Date.parse('2026-11-23T12:10:00.000Z');
const STARTED_TWO_MINUTES_AGO = '2026-11-23T12:08:00.000Z';

describe('elapsedSecondsOf', () => {
  it('returns stored elapsedSeconds when clockStartedAt is absent', () => {
    expect(elapsedSecondsOf({ elapsedSeconds: 300 }, NOW)).toBe(300);
    expect(elapsedSecondsOf({}, NOW)).toBe(0);
  });

  it('adds floored seconds since clockStartedAt without going negative', () => {
    expect(
      elapsedSecondsOf({ elapsedSeconds: 45, clockStartedAt: STARTED_TWO_MINUTES_AGO }, NOW),
    ).toBe(165);
    expect(
      elapsedSecondsOf({ elapsedSeconds: 45, clockStartedAt: '2026-11-23T12:10:05.000Z' }, NOW),
    ).toBe(45);
  });
});

describe('publicClockOf', () => {
  const football = footballDescriptor();
  const tennis = tennisDescriptor();

  it('returns a running clock for an active timed segment with clockStartedAt', () => {
    expect(
      publicClockOf(
        [
          {
            type: 'half',
            number: 1,
            state: 'active',
            elapsedSeconds: 465,
            clockStartedAt: STARTED_TWO_MINUTES_AGO,
          },
        ],
        football,
        NOW,
      ),
    ).toEqual({
      segmentNumber: 1,
      elapsedSeconds: 585,
      running: true,
      asOf: '2026-11-23T12:10:00.000Z',
    });
  });

  it('returns a stopped clock for an active timed segment without clockStartedAt', () => {
    expect(
      publicClockOf(
        [
          {
            type: 'half',
            number: 2,
            state: 'active',
            elapsedSeconds: 585,
          },
        ],
        football,
        NOW,
      ),
    ).toEqual({
      segmentNumber: 2,
      elapsedSeconds: 585,
      running: false,
      asOf: '2026-11-23T12:10:00.000Z',
    });
  });

  it('returns undefined for an untimed active segment', () => {
    expect(
      publicClockOf(
        [
          {
            type: 'set',
            number: 1,
            state: 'active',
            elapsedSeconds: 0,
            clockStartedAt: STARTED_TWO_MINUTES_AGO,
          },
        ],
        tennis,
        NOW,
      ),
    ).toBeUndefined();
  });

  it('returns undefined when no segment is active', () => {
    expect(
      publicClockOf(
        [
          { type: 'half', number: 1, state: 'completed', elapsedSeconds: 2700 },
          { type: 'half', number: 2, state: 'pending', elapsedSeconds: 0 },
        ],
        football,
        NOW,
      ),
    ).toBeUndefined();
  });
});

describe('clockChangedPayloadOf', () => {
  it('returns the five public fields for a timed segment and undefined for an untimed one', () => {
    expect(
      clockChangedPayloadOf(
        'match-1',
        {
          type: 'half',
          number: 1,
          elapsedSeconds: 465,
          clockStartedAt: STARTED_TWO_MINUTES_AGO,
        },
        footballDescriptor(),
        NOW,
      ),
    ).toEqual({
      matchId: 'match-1',
      segmentNumber: 1,
      elapsedSeconds: 585,
      running: true,
      changedAt: '2026-11-23T12:10:00.000Z',
    });

    expect(
      clockChangedPayloadOf(
        'match-2',
        { type: 'set', number: 1, elapsedSeconds: 0 },
        tennisDescriptor(),
        NOW,
      ),
    ).toBeUndefined();
  });
});
