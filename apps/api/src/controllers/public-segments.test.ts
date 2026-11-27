import { tennisDescriptor, type RecordedEvent, type Segment } from '@copalibre/domain';
import { scoreAfterOf, segmentSummariesOf } from './public-segments.js';

const descriptor = tennisDescriptor();
const [HOME, AWAY] = ['entrant-home', 'entrant-away'] as const;

const segment = (number: number, state: Segment['state'], type = 'set'): Segment => ({
  segmentId: `segment-${number}`,
  matchId: 'match',
  type,
  number,
  state,
});
const point = (segmentNumber: number, side: string, sequence: number): RecordedEvent => ({
  eventId: `event-${sequence}`,
  matchId: 'match',
  segmentId: `segment-${segmentNumber}`,
  definitionCode: 'point',
  occurredAt: '2026-03-01T18:00:00.000Z',
  sequence,
  side,
  payload: {},
});

describe('segmentSummariesOf', () => {
  const events = [
    point(1, HOME, 1),
    point(1, HOME, 2),
    point(1, AWAY, 3),
    point(2, AWAY, 4),
    point(2, AWAY, 5),
    point(3, HOME, 6),
  ];

  it('scores each segment from its own events alone, home first', () => {
    const summaries = segmentSummariesOf(
      descriptor,
      [segment(1, 'completed'), segment(2, 'completed'), segment(3, 'active')],
      events,
      [HOME, AWAY],
    );

    expect(summaries.map((one) => one.scores)).toEqual([
      [2, 1],
      [0, 2],
      [1, 0],
    ]);
    expect(summaries.map((one) => one.state)).toEqual(['completed', 'completed', 'active']);
  });

  it('carries the descriptor’s label in every language, and says a set is not timed', () => {
    const [first] = segmentSummariesOf(descriptor, [segment(1, 'active')], [], [HOME, AWAY]);

    expect(first?.timed).toBe(false);
    expect(first?.label).toMatchObject({ en: 'Set', de: 'Satz', zh: '盘' });
  });

  it('keeps segments in match order whatever order they came in', () => {
    const summaries = segmentSummariesOf(
      descriptor,
      [segment(2, 'pending'), segment(1, 'completed')],
      [],
      [HOME, AWAY],
    );
    expect(summaries.map((one) => one.number)).toEqual([1, 2]);
  });

  it('gives no scores when a side is not yet known', () => {
    const [only] = segmentSummariesOf(descriptor, [segment(1, 'active')], events, [
      HOME,
      undefined,
    ]);
    expect(only?.scores).toBeUndefined();
  });

  it('names a segment type the descriptor does not declare without inventing a label', () => {
    const [unknown] = segmentSummariesOf(
      descriptor,
      [segment(1, 'active', 'mystery')],
      [],
      [HOME, AWAY],
    );
    expect(unknown?.label).toBeUndefined();
    expect(unknown?.timed).toBeUndefined();
  });
});

describe('scoreAfterOf', () => {
  it('gives the score after each scoring event, and the last one is the score the events add up to', () => {
    const events = [
      point(1, HOME, 1),
      point(1, HOME, 2),
      point(1, AWAY, 3),
      point(2, AWAY, 4),
      point(2, AWAY, 5),
      point(3, HOME, 6),
    ];

    const scores = scoreAfterOf(descriptor, events, [HOME, AWAY]);

    expect([...scores.values()]).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [3, 3],
    ]);
    expect(scores.get('event-6')).toEqual([3, 3]);
  });

  it('reads events in sequence order whatever order they arrive in', () => {
    const events = [point(1, AWAY, 2), point(1, HOME, 1)];

    expect(scoreAfterOf(descriptor, events, [HOME, AWAY])).toEqual(
      new Map([
        ['event-1', [1, 0]],
        ['event-2', [1, 1]],
      ]),
    );
  });

  it('folds a 250-event match once per event, and its last entry is the final score', () => {
    const events = Array.from({ length: 250 }, (_, index) =>
      point(index < 150 ? 1 : 2, index % 3 === 0 ? AWAY : HOME, index + 1),
    );
    const homeCount = events.filter((event) => event.side === HOME).length;
    const awayCount = events.length - homeCount;

    const scores = scoreAfterOf(descriptor, events, [HOME, AWAY]);

    expect(scores.size).toBe(250);
    expect(scores.get('event-250')).toEqual([homeCount, awayCount]);
    expect(scores.get('event-1')).toEqual([0, 1]);
  });

  it('gives no entries for a match with no events', () => {
    expect(scoreAfterOf(descriptor, [], [HOME, AWAY]).size).toBe(0);
  });
});
