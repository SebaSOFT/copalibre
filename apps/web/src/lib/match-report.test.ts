import { describe, expect, it } from '@jest/globals';
import type { PublicMatchReportResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { buildMatchReport } from './match-report.js';

const report = (): PublicMatchReportResponse => ({
  organizationAlias: 'liga-orbital',
  organizationName: 'Liga Orbital',
  tournamentAlias: 'apertura',
  tournamentName: 'Apertura',
  stageNumber: 1,
  matchNumber: 4,
  round: 2,
  status: 'final',
  homeName: 'Comets',
  awayName: 'Rockets',
  homeScore: 2,
  awayScore: 1,
  schedulePublished: true,
  officials: [],
  rosters: {
    home: [{ personId: 'person-1', number: 9, name: 'Ada', onField: true }],
    away: [],
  },
  timeline: [
    {
      eventId: 'event-1',
      definitionCode: 'foul',
      label: 'Foul',
      workflowOutcomeCodes: ['missed-shot'],
      occurredAt: '2026-08-19T12:00:00.000Z',
      sequence: 1,
      payload: {},
    },
    {
      eventId: 'event-2',
      definitionCode: 'missed-shot',
      label: 'Missed shot',
      occurredAt: '2026-08-19T12:00:01.000Z',
      sequence: 2,
      personId: 'person-1',
      payload: {},
    },
    {
      eventId: 'event-3',
      definitionCode: 'goal',
      label: 'Goal',
      occurredAt: '2026-08-19T12:01:00.000Z',
      sequence: 3,
      payload: {},
    },
  ],
});

describe('buildMatchReport', () => {
  it('groups an immediately declared workflow outcome without inventing a relationship', () => {
    const model = buildMatchReport(report());

    expect(model.timeline).toHaveLength(2);
    expect(model.timeline[0]).toMatchObject({ kind: 'workflow' });
    expect(model.timeline[0]?.events.map((event) => event.label)).toEqual(['Foul', 'Missed shot']);
    expect(model.timeline[0]?.events[1]?.actor).toBe('#9 Ada');
    expect(model.timeline[1]).toMatchObject({ kind: 'single' });
  });

  it('keeps empty upcoming roster and timeline sections explicit in the model', () => {
    const model = buildMatchReport({
      ...report(),
      status: 'upcoming',
      rosters: { home: [], away: [] },
      timeline: [],
    });

    expect(model.home.roster).toEqual([]);
    expect(model.away.roster).toEqual([]);
    expect(model.timeline).toEqual([]);
  });

  it('preserves final status so the page can suppress scheduling placeholder banners', () => {
    const model = buildMatchReport({ ...report(), status: 'final', scheduledAt: undefined });

    // A final match must carry status 'final' — the page template uses this to
    // gate "Schedule not yet available" and "Schedule has not yet been published"
    // banners, which must be absent for completed matches.
    expect(model.status).toBe('final');
    expect(model.scheduledAt).toBeUndefined();
  });

  it('preserves live status so the page can suppress scheduling placeholder banners', () => {
    const model = buildMatchReport({ ...report(), status: 'live', scheduledAt: undefined });

    expect(model.status).toBe('live');
    expect(model.scheduledAt).toBeUndefined();
  });
});
