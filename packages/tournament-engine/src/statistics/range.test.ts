import type { RecordedEvent, StatisticCollector } from '@copalibre/domain';
import { validateCollectors } from '@copalibre/domain';
import { aggregateTo, foldStatistics, type ActorContext } from './fold.js';

/**
 * The point of the generalization, tested as *range* rather than as a screen.
 *
 * One declaration set answers questions that vary on all four axes at once —
 * two actor granularities, two competition granularities, an accumulation
 * window and a source that is not an event — with no code between them. So the
 * same collectors are then reused by a second, deliberately unlike discipline:
 * if they only work for the sport they were written next to, they are a
 * hardcoded fold wearing a declaration's clothes.
 */

const CONTEXT = {
  matchId: 'm-1',
  stageId: 'st-1',
  seasonId: 'se-1',
  tournamentId: 't-1',
  organizationId: 'org-1',
};

const HOME: ActorContext = {
  personId: 'pe-1',
  playerId: 'pl-1',
  teamId: 'tm-1',
  clubId: 'cl-1',
};
const AWAY: ActorContext = {
  personId: 'pe-2',
  playerId: 'pl-2',
  teamId: 'tm-2',
  clubId: 'cl-2',
};

/** Four collectors, four different questions, one vocabulary. */
const COLLECTORS: readonly StatisticCollector[] = [
  {
    code: 'scores',
    label: 'Anotaciones',
    source: { kind: 'event', definitionCodes: ['score'] },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
  },
  {
    code: 'team-scores',
    label: 'Anotaciones del equipo',
    source: { kind: 'event', definitionCodes: ['score'] },
    measure: { kind: 'count' },
    granularity: { actor: 'team', competition: 'season' },
  },
  {
    // Per segment: the accumulation window is the granularity, and the match
    // figure is the sum of the periods rather than a count that restarted.
    code: 'sanctions-per-period',
    label: 'Sanciones por período',
    source: { kind: 'event', definitionCodes: ['sanction'] },
    measure: { kind: 'count' },
    granularity: { actor: 'team', competition: 'segment' },
  },
  {
    code: 'appearances',
    label: 'Presencias',
    source: { kind: 'participation', roles: ['player'] },
    measure: { kind: 'count' },
    granularity: { actor: 'person', competition: 'match' },
  },
];

function event(
  sequence: number,
  definitionCode: string,
  side: string,
  personId?: string,
): RecordedEvent {
  return {
    eventId: `e-${sequence}`,
    sequence,
    matchId: 'm-1',
    segmentId: 'seg-1',
    definitionCode,
    occurredAt: '2026-08-01T20:00:00.000Z',
    payload: {},
    side,
    ...(personId === undefined ? {} : { personId }),
  };
}

function fold(events: readonly RecordedEvent[]) {
  return foldStatistics({
    collectors: COLLECTORS,
    events,
    roster: [
      { ...HOME, role: 'player' },
      { ...AWAY, role: 'player' },
    ],
    actorOf: (entrantId) =>
      entrantId === 'en-home' ? HOME : entrantId === 'en-away' ? AWAY : undefined,
    entrantIds: ['en-home', 'en-away'],
    context: CONTEXT,
  });
}

describe('one declaration set, four axes', () => {
  it('installs as a set, with nothing inert', () => {
    const result = validateCollectors(COLLECTORS, {
      eventCodes: ['score', 'sanction'],
      statisticCodes: [],
      tagCodes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.inert).toEqual([]);
  });

  it('answers all four at once from one pass over one match', () => {
    const figures = fold([
      event(1, 'score', 'en-home', 'pe-1'),
      event(2, 'score', 'en-home', 'pe-1'),
      event(3, 'sanction', 'en-away', 'pe-2'),
    ]);

    const at = (code: string, actorId: string) =>
      figures.find((figure) => figure.collectorCode === code && figure.actorId === actorId);

    expect(at('scores', 'pe-1')?.value).toBe(2);
    expect(at('team-scores', 'tm-1')).toMatchObject({
      value: 2,
      competitionGranularity: 'season',
      competitionId: 'se-1',
    });
    expect(at('sanctions-per-period', 'tm-2')).toMatchObject({
      value: 1,
      competitionGranularity: 'segment',
    });
    // Nobody records "he played": it comes from the roster, which is why a
    // player who touched nothing still has a presence.
    expect(at('appearances', 'pe-2')?.value).toBe(1);
  });

  it('rolls the person figures up to the club without a second declaration', () => {
    const figures = fold([event(1, 'score', 'en-home', 'pe-1')]);
    const perClub = aggregateTo(
      figures.filter((figure) => figure.collectorCode === 'scores'),
      { kind: 'count' },
      { actor: 'club' },
      { actorAt: () => 'cl-1' },
    );

    expect(perClub[0]).toMatchObject({ actorId: 'cl-1', value: 1 });
  });
});

/**
 * A second discipline, chosen to be unlike the first: no teams that persist
 * across a season in the same sense, a sanction that means something else, and
 * a "score" that is a leg of a relay rather than a goal. Nothing about the
 * collectors changes — only what the codes are called in the module document.
 */
describe('the same collectors under a deliberately unlike discipline', () => {
  const SWIMMER: ActorContext = { personId: 'sw-1', playerId: 'lane-1', teamId: 'club-a' };
  const RIVAL: ActorContext = { personId: 'sw-2', playerId: 'lane-2', teamId: 'club-b' };

  it('counts legs, disqualifications and heats with the declarations written for a ball sport', () => {
    const figures = foldStatistics({
      collectors: COLLECTORS,
      events: [
        // Two legs swum by one person, and a disqualification against the other
        // club — the same two event codes, meaning something else entirely.
        event(1, 'score', 'en-a', 'sw-1'),
        event(2, 'score', 'en-a', 'sw-1'),
        event(3, 'sanction', 'en-b', 'sw-2'),
      ],
      roster: [
        { ...SWIMMER, role: 'player' },
        { ...RIVAL, role: 'player' },
      ],
      actorOf: (entrantId) =>
        entrantId === 'en-a' ? SWIMMER : entrantId === 'en-b' ? RIVAL : undefined,
      entrantIds: ['en-a', 'en-b'],
      context: CONTEXT,
    });

    const at = (code: string, actorId: string) =>
      figures.find((figure) => figure.collectorCode === code && figure.actorId === actorId);

    expect(at('scores', 'sw-1')?.value).toBe(2);
    expect(at('team-scores', 'club-a')?.value).toBe(2);
    expect(at('sanctions-per-period', 'club-b')?.value).toBe(1);
    expect(at('appearances', 'sw-2')?.value).toBe(1);
  });

  it('produces no club figure where nothing declares a club, rather than inventing one', () => {
    // A swimmer entered individually has no club row to be filed under, and
    // attributing the swim to one would be a fact nobody recorded.
    const figures = foldStatistics({
      collectors: [
        {
          code: 'club-scores',
          label: 'Anotaciones del club',
          source: { kind: 'event', definitionCodes: ['score'] },
          measure: { kind: 'count' },
          granularity: { actor: 'club', competition: 'season' },
        },
      ],
      events: [event(1, 'score', 'en-a', 'sw-1')],
      roster: [],
      actorOf: () => SWIMMER,
      entrantIds: ['en-a'],
      context: CONTEXT,
    });

    expect(figures).toEqual([]);
  });
});
