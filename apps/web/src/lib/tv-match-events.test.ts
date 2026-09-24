import { describe, expect, it } from '@jest/globals';
import type { PublicMatchReportResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { buildTvMatchEvents } from './tv-match-events.js';

const report = (): PublicMatchReportResponse => ({
  organizationAlias: 'liga-orbital',
  organizationName: 'Liga Orbital',
  tournamentAlias: 'apertura',
  tournamentName: 'Apertura',
  stageNumber: 1,
  stageFormat: 'single-elimination',
  matchNumber: 4,
  round: 2,
  status: 'live',
  homeEntrantId: 'entrant-home',
  homeName: 'Comets',
  awayEntrantId: 'entrant-away',
  awayName: 'Rockets',
  homeScore: 2,
  awayScore: 1,
  schedulePublished: true,
  officials: [],
  rosters: {
    home: [{ personId: 'person-1', number: 9, name: 'Ada', onField: true }],
    away: [{ personId: 'person-2', name: 'Blue', onField: true }],
  },
  timeline: [
    {
      eventId: 'event-1',
      definitionCode: 'goal',
      label: 'Goal',
      occurredAt: '2026-08-19T12:00:00.000Z',
      sequence: 1,
      side: 'entrant-home',
      personId: 'person-1',
      payload: {},
    },
    {
      eventId: 'event-2',
      definitionCode: 'card',
      label: 'Yellow card',
      occurredAt: '2026-08-19T12:10:00.000Z',
      sequence: 2,
      side: 'entrant-away',
      personId: 'person-2',
      payload: {},
    },
    {
      eventId: 'event-3',
      definitionCode: 'kickoff',
      label: 'Kickoff',
      occurredAt: '2026-08-19T11:00:00.000Z',
      sequence: 0,
      payload: {},
    },
  ],
});

describe('buildTvMatchEvents (openspec 0270)', () => {
  it('resolves each event to its side and player', () => {
    const events = buildTvMatchEvents(report());

    expect(events).toEqual([
      {
        eventId: 'event-1',
        label: 'Goal',
        occurredAt: '2026-08-19T12:00:00.000Z',
        side: 'home',
        actor: '#9 Ada',
      },
      {
        eventId: 'event-2',
        label: 'Yellow card',
        occurredAt: '2026-08-19T12:10:00.000Z',
        side: 'away',
        actor: 'Blue',
      },
      {
        eventId: 'event-3',
        label: 'Kickoff',
        occurredAt: '2026-08-19T11:00:00.000Z',
      },
    ]);
  });

  it('returns an empty list for a match with no recorded events', () => {
    expect(buildTvMatchEvents({ ...report(), timeline: [] })).toEqual([]);
  });

  it('leaves side unset when an event names an entrant neither side declares', () => {
    const withUnknownSide: PublicMatchReportResponse = {
      ...report(),
      timeline: [
        {
          eventId: 'event-x',
          definitionCode: 'goal',
          label: 'Goal',
          occurredAt: '2026-08-19T12:00:00.000Z',
          sequence: 1,
          side: 'some-other-entrant',
          payload: {},
        },
      ],
    };

    expect(buildTvMatchEvents(withUnknownSide)[0]?.side).toBeUndefined();
  });

  it('leaves actor unset when an event names a person not on either roster', () => {
    const withUnknownPerson: PublicMatchReportResponse = {
      ...report(),
      timeline: [
        {
          eventId: 'event-y',
          definitionCode: 'goal',
          label: 'Goal',
          occurredAt: '2026-08-19T12:00:00.000Z',
          sequence: 1,
          personId: 'not-on-a-roster',
          payload: {},
        },
      ],
    };

    expect(buildTvMatchEvents(withUnknownPerson)[0]?.actor).toBeUndefined();
  });
});
