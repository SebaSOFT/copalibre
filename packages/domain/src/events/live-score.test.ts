import { footballDescriptor } from '../modules/football-descriptor.js';
import { foldLiveScores } from './live-score.js';

describe('foldLiveScores', () => {
  it('derives score and declared statistics from match facts', () => {
    const scores = foldLiveScores(
      footballDescriptor(),
      [
        {
          eventId: 'event-1',
          matchId: 'match-1',
          segmentId: 'segment-1',
          definitionCode: 'goal',
          occurredAt: '2026-08-03T20:00:00.000Z',
          sequence: 1,
          side: 'entrant-a',
          personId: 'person-a',
          payload: {},
        },
        {
          eventId: 'event-2',
          matchId: 'match-1',
          segmentId: 'segment-1',
          definitionCode: 'goal',
          occurredAt: '2026-08-03T20:02:00.000Z',
          sequence: 2,
          side: 'entrant-b',
          personId: 'person-b',
          payload: {},
        },
        {
          eventId: 'event-3',
          matchId: 'match-1',
          segmentId: 'segment-1',
          definitionCode: 'goal',
          occurredAt: '2026-08-03T20:03:00.000Z',
          sequence: 3,
          side: 'entrant-a',
          personId: 'person-a',
          payload: {},
        },
      ],
      ['entrant-a', 'entrant-b'],
    );

    expect(scores).toEqual([
      { entrantId: 'entrant-a', score: 2, statistics: { 'goals-for': 2, 'goals-against': 1 } },
      { entrantId: 'entrant-b', score: 1, statistics: { 'goals-for': 1, 'goals-against': 2 } },
    ]);
  });

  it('credits an opponent-targeted statistic effect to every other entrant, not the actor', () => {
    const descriptor = footballDescriptor({
      eventDefinitions: [
        {
          code: 'own-goal',
          label: 'Own goal',
          category: 'negative',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'side',
          payloadSchema: { type: 'object' },
          effects: [
            { kind: 'statistic', statisticCode: 'goals-against', delta: 1, awardTo: 'actor' },
            {
              kind: 'statistic',
              statisticCode: 'goals-for',
              delta: 1,
              awardTo: 'every-other-side',
            },
          ],
        },
      ],
    });

    expect(
      foldLiveScores(
        descriptor,
        [
          {
            eventId: 'event-1',
            matchId: 'match-1',
            segmentId: 'segment-1',
            definitionCode: 'own-goal',
            occurredAt: '2026-08-03T20:00:00.000Z',
            sequence: 1,
            side: 'entrant-a',
            payload: {},
          },
        ],
        ['entrant-a', 'entrant-b', 'entrant-c'],
      ),
    ).toEqual([
      { entrantId: 'entrant-a', score: 0, statistics: { 'goals-against': 1 } },
      { entrantId: 'entrant-b', score: 0, statistics: { 'goals-for': 1 } },
      { entrantId: 'entrant-c', score: 0, statistics: { 'goals-for': 1 } },
    ]);
  });

  it('skips a payload-field-targeted statistic effect, which needs person resolution this fold does not have', () => {
    const descriptor = footballDescriptor({
      eventDefinitions: [
        {
          code: 'assisted-goal',
          label: 'Assisted goal',
          category: 'positive',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'person',
          payloadSchema: { type: 'object', properties: { assistedBy: { type: 'string' } } },
          effects: [
            {
              kind: 'statistic',
              statisticCode: 'assists',
              delta: 1,
              awardTo: { payloadField: 'assistedBy' },
            },
          ],
        },
      ],
    });

    expect(
      foldLiveScores(
        descriptor,
        [
          {
            eventId: 'event-1',
            matchId: 'match-1',
            segmentId: 'segment-1',
            definitionCode: 'assisted-goal',
            occurredAt: '2026-08-03T20:00:00.000Z',
            sequence: 1,
            side: 'entrant-a',
            personId: 'person-a',
            payload: { assistedBy: 'person-z' },
          },
        ],
        ['entrant-a', 'entrant-b'],
      ),
    ).toEqual([
      { entrantId: 'entrant-a', score: 0, statistics: {} },
      { entrantId: 'entrant-b', score: 0, statistics: {} },
    ]);
  });

  it('credits every other entrant for an opponent score effect', () => {
    const descriptor = footballDescriptor({
      eventDefinitions: [
        {
          code: 'own-goal',
          label: 'Own goal',
          category: 'negative',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'side',
          payloadSchema: { type: 'object' },
          effects: [{ kind: 'score', awardTo: 'every-other-side', delta: 1 }],
        },
      ],
    });

    expect(
      foldLiveScores(
        descriptor,
        [
          {
            eventId: 'event-1',
            matchId: 'match-1',
            segmentId: 'segment-1',
            definitionCode: 'own-goal',
            occurredAt: '2026-08-03T20:00:00.000Z',
            sequence: 1,
            side: 'entrant-a',
            payload: {},
          },
        ],
        ['entrant-a', 'entrant-b', 'entrant-c'],
      ),
    ).toEqual([
      { entrantId: 'entrant-a', score: 0, statistics: {} },
      { entrantId: 'entrant-b', score: 1, statistics: {} },
      { entrantId: 'entrant-c', score: 1, statistics: {} },
    ]);
  });
});
