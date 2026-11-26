import { describe, expect, it } from '@jest/globals';
import type { PublicMatchReportResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import {
  buildMatchReport,
  formatElapsed,
  matchStakeLines,
  sortRosterMembers,
  type MatchReportModel,
  type MatchReportOptions,
} from './match-report.js';
import type { BracketMatch } from './bracket.js';
import { competitionContextLabels, publicIntl, sideSourceLabels } from './i18n/public-intl.js';

const report = (): PublicMatchReportResponse => ({
  matchId: 'match-1',
  organizationAlias: 'liga-orbital',
  organizationName: 'Liga Orbital',
  tournamentAlias: 'apertura',
  tournamentName: 'Apertura',
  stageNumber: 1,
  stageFormat: 'single-elimination',
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

const build = (
  response: PublicMatchReportResponse,
  options: Partial<MatchReportOptions> = {},
): MatchReportModel =>
  buildMatchReport(response, { sideSource: sideSourceLabels(publicIntl('en')), ...options });

describe('buildMatchReport', () => {
  it('groups an immediately declared workflow outcome without inventing a relationship', () => {
    const model = build(report());

    expect(model.timeline).toHaveLength(2);
    expect(model.timeline[0]).toMatchObject({ kind: 'workflow' });
    expect(model.timeline[0]?.events.map((event) => event.label)).toEqual(['Foul', 'Missed shot']);
    expect(model.timeline[0]?.events[1]?.actor).toBe('#9 Ada');
    expect(model.timeline[1]).toMatchObject({ kind: 'single' });
  });

  it('names an undecided side by its source, or as unknown without the catalogue', () => {
    const undecided = {
      ...report(),
      status: 'upcoming',
      awayName: undefined,
      awaySource: { kind: 'loser-of', nodeKey: 'SE-R1-M2', matchId: 'm', round: 1, position: 2 },
    } as PublicMatchReportResponse;

    expect(build(undecided, { sideSource: sideSourceLabels(publicIntl('es')) }).away.name).toBe(
      'Perdedor de Ronda 1, partido 2',
    );
    expect(
      build(undecided, {
        sideSource: sideSourceLabels(publicIntl('en')),
        sourceFinalRound: 2,
      }).away.name,
    ).toBe('Loser of Semi-final 2');
    expect(build({ ...undecided, awaySource: undefined }).away.name).toBe('Awaiting participant');
    expect(build(undecided).home.name).toBe('Comets');
  });

  it('keeps empty upcoming roster and timeline sections explicit in the model', () => {
    const model = build({
      ...report(),
      status: 'upcoming',
      rosters: { home: [], away: [] },
      timeline: [],
    });

    expect(model.home.roster).toEqual([]);
    expect(model.away.roster).toEqual([]);
    expect(model.timeline).toEqual([]);
  });

  it('replaces an opted-out person on the match, roster and event timeline', () => {
    const response: PublicMatchReportResponse = {
      ...report(),
      homeName: undefined,
      homeHiddenAtRequest: true,
      rosters: {
        home: [{ hiddenAtRequest: true, publicProfileAvailable: false, onField: true }],
        away: [],
      },
      timeline: [
        {
          eventId: 'event-hidden',
          definitionCode: 'goal',
          label: 'Goal',
          occurredAt: '2026-08-19T12:00:00.000Z',
          sequence: 1,
          hiddenAtRequest: true,
          payload: {},
        },
      ],
    };
    const label = 'Participante oculto por solicitud propia';
    const model = build(response, { hiddenPersonLabel: label });

    expect(model.home.name).toBe(label);
    expect(model.home.roster[0]?.name).toBe(label);
    expect(model.home.roster[0]?.personId).toBeUndefined();
    expect(model.timeline[0]?.events[0]?.actor).toBe(label);
  });

  it('preserves final status so the page can suppress scheduling placeholder banners', () => {
    const model = build({ ...report(), status: 'final', scheduledAt: undefined });

    // A final match must carry status 'final' — the page template uses this to
    // gate "Schedule not yet available" and "Schedule has not yet been published"
    // banners, which must be absent for completed matches.
    expect(model.status).toBe('final');
    expect(model.scheduledAt).toBeUndefined();
  });

  it('preserves live status so the page can suppress scheduling placeholder banners', () => {
    const model = build({ ...report(), status: 'live', scheduledAt: undefined });

    expect(model.status).toBe('live');
    expect(model.scheduledAt).toBeUndefined();
  });
});

describe('buildMatchReport labels', () => {
  const localized = (): PublicMatchReportResponse => ({
    ...report(),
    officials: [{ name: 'María', roles: ['referee', 'table-official'] }],
    rosterRoles: [
      { code: 'goalkeeper', badge: 'GK', label: { en: 'Goalkeeper', es: 'Arquero' } },
      { code: 'captain', label: 'Captain' },
    ],
    rosters: {
      home: [
        {
          personId: 'person-1',
          number: 1,
          name: 'Ada',
          onField: true,
          roles: ['goalkeeper', 'captain', 'unlisted-role'],
        },
      ],
      away: [],
    },
    timeline: [
      {
        eventId: 'event-1',
        definitionCode: 'goal',
        label: 'Goal',
        labels: { en: 'Goal', es: 'Gol' },
        occurredAt: '2026-08-19T12:00:00.000Z',
        sequence: 1,
        payload: {},
      },
    ],
  });

  it('shows the descriptor labels in the page language', () => {
    const model = build(localized(), { locale: 'es' });

    expect(model.timeline[0]?.events[0]?.label).toBe('Gol');
    expect(model.home.roster[0]?.roleLabels).toEqual(['Arquero', 'Captain', 'Unlisted role']);
  });

  it('keeps English when no language is requested', () => {
    const model = build(localized());

    expect(model.timeline[0]?.events[0]?.label).toBe('Goal');
    expect(model.home.roster[0]?.roleLabels[0]).toBe('Goalkeeper');
  });

  it('names official roles through the supplied resolver, humanizing unknown codes', () => {
    const model = build(localized(), {
      locale: 'es',
      officialRoleLabel: (code) => (code === 'referee' ? 'Árbitro' : `?${code}`),
    });

    expect(model.officials[0]?.roleLabels).toEqual(['Árbitro', '?table-official']);
    expect(build(localized()).officials[0]?.roleLabels).toEqual(['Referee', 'Table official']);
  });
});

describe('matchStakeLines', () => {
  const esIntl = publicIntl('es');
  const stakeLabels = {
    context: competitionContextLabels(esIntl),
    stakeWinner: 'El ganador juega {match}{when}',
    stakeLoser: 'El perdedor juega {match}{when}',
    stakePlace: 'Define el {place}',
    stakeChampion: 'Define el campeón de {zone}',
    fallbackChampionScope: 'Torneo',
  };

  const cupBracket: readonly BracketMatch[] = [
    {
      matchId: 'qf1',
      nodeKey: 'SE-R1-M1',
      matchNumber: 1,
      roundNumber: 1,
      branch: 'winners',
      sourceFinalRound: 3,
      state: 'final',
      slots: [
        { kind: 'entrant', name: 'A' },
        { kind: 'entrant', name: 'B' },
      ],
    },
    {
      matchId: 'sf1',
      nodeKey: 'SE-R2-M1',
      matchNumber: 9,
      roundNumber: 2,
      branch: 'winners',
      sourceFinalRound: 3,
      state: 'upcoming',
      slots: [
        { kind: 'winner-of', nodeKey: 'SE-R1-M1', matchId: 'qf1', matchNumber: 1 },
        { kind: 'winner-of', nodeKey: 'SE-R1-M2', matchNumber: 2 },
      ],
    },
    {
      matchId: 'final',
      nodeKey: 'SE-R3-M1',
      matchNumber: 15,
      roundNumber: 3,
      branch: 'winners',
      sourceFinalRound: 3,
      state: 'upcoming',
      slots: [
        { kind: 'winner-of', nodeKey: 'SE-R2-M1', matchNumber: 9 },
        { kind: 'winner-of', nodeKey: 'SE-R2-M2', matchNumber: 10 },
      ],
    },
    {
      matchId: 'pl5-1',
      nodeKey: 'PL5-R1-M1',
      matchNumber: 5,
      roundNumber: 1,
      branch: 'placement',
      role: 'places-5-8',
      state: 'upcoming',
      slots: [
        { kind: 'loser-of', nodeKey: 'SE-R1-M1', matchId: 'qf1', matchNumber: 1 },
        { kind: 'loser-of', nodeKey: 'SE-R1-M2', matchNumber: 2 },
      ],
    },
    {
      matchId: 'pl5-2',
      nodeKey: 'PL5-R1-M2',
      matchNumber: 6,
      roundNumber: 1,
      branch: 'placement',
      role: 'places-5-8',
      state: 'upcoming',
      slots: [],
    },
    {
      matchId: 'pl5',
      nodeKey: 'placement-5',
      matchNumber: 13,
      roundNumber: 2,
      branch: 'placement',
      role: 'place-5',
      state: 'upcoming',
      slots: [
        { kind: 'winner-of', nodeKey: 'PL5-R1-M1', matchNumber: 5 },
        { kind: 'winner-of', nodeKey: 'PL5-R1-M2', matchNumber: 6 },
      ],
    },
  ];

  it('names both winner and loser targets with scheduled dates for a quarter-final', () => {
    const lines = matchStakeLines({
      currentMatch: {
        nodeKey: 'SE-R1-M1',
        matchNumber: 1,
        stageNumber: 2,
        stageName: 'Copas',
        zoneName: 'Copa Oro',
        round: 1,
        sourceFinalRound: 3,
      },
      bracketMatches: cupBracket,
      stageMatches: [
        { matchNumber: 9, scheduledAt: '2026-11-23T18:00:00.000Z' },
        { matchNumber: 5, scheduledAt: '2026-11-23T14:00:00.000Z' },
      ],
      labels: stakeLabels,
      formatDate: (at) => (at.includes('18:00') ? '23 nov 15:00' : '23 nov 11:00'),
    });

    expect(lines).toEqual([
      'El ganador juega Copa Oro · Semifinal, 23 nov 15:00',
      'El perdedor juega Copa Oro · Semifinal 5º al 8º puesto, 23 nov 11:00',
    ]);
  });

  it('keeps outgoing stake targets when target slots are already populated with entrant.from', () => {
    const resolvedBracket: readonly BracketMatch[] = [
      {
        matchId: 'qf1',
        nodeKey: 'SE-R1-M1',
        matchNumber: 1,
        roundNumber: 1,
        branch: 'winners',
        sourceFinalRound: 3,
        state: 'final',
        scores: [4, 2],
        slots: [
          { kind: 'entrant', entrantId: 'e1', name: 'Concepción' },
          { kind: 'entrant', entrantId: 'e2', name: 'Valenciano' },
        ],
      },
      {
        matchId: 'sf1',
        nodeKey: 'SE-R2-M1',
        matchNumber: 9,
        roundNumber: 2,
        branch: 'winners',
        sourceFinalRound: 3,
        state: 'upcoming',
        slots: [
          {
            kind: 'entrant',
            entrantId: 'e1',
            name: 'Concepción',
            from: { matchId: 'qf1', outcome: 'winner' },
          },
          { kind: 'winner-of', nodeKey: 'SE-R1-M2', matchNumber: 2 },
        ],
      },
      {
        matchId: 'pl5-1',
        nodeKey: 'PL5-R1-M1',
        matchNumber: 5,
        roundNumber: 1,
        branch: 'placement',
        role: 'places-5-8',
        state: 'upcoming',
        slots: [
          {
            kind: 'entrant',
            entrantId: 'e2',
            name: 'Valenciano',
            from: { matchId: 'qf1', outcome: 'loser' },
          },
          { kind: 'loser-of', nodeKey: 'SE-R1-M2', matchNumber: 2 },
        ],
      },
      {
        matchId: 'pl5-2',
        nodeKey: 'PL5-R1-M2',
        matchNumber: 6,
        roundNumber: 1,
        branch: 'placement',
        role: 'places-5-8',
        state: 'upcoming',
        slots: [],
      },
      {
        matchId: 'pl5',
        nodeKey: 'placement-5',
        matchNumber: 13,
        roundNumber: 2,
        branch: 'placement',
        role: 'place-5',
        state: 'upcoming',
        slots: [],
      },
    ];

    const lines = matchStakeLines({
      currentMatch: {
        nodeKey: 'SE-R1-M1',
        matchNumber: 1,
        stageNumber: 2,
        stageName: 'Copas',
        zoneName: 'Copa Oro',
        round: 1,
        sourceFinalRound: 3,
      },
      bracketMatches: resolvedBracket,
      stageMatches: [
        { matchNumber: 9, scheduledAt: '2026-11-23T18:00:00.000Z' },
        { matchNumber: 5, scheduledAt: '2026-11-23T14:00:00.000Z' },
      ],
      labels: stakeLabels,
      formatDate: (at) => (at.includes('18:00') ? '23 nov 15:00' : '23 nov 11:00'),
    });

    expect(lines).toEqual([
      'El ganador juega Copa Oro · Semifinal, 23 nov 15:00',
      'El perdedor juega Copa Oro · Semifinal 5º al 8º puesto, 23 nov 11:00',
    ]);
  });

  it('matches outgoing targets by matchId or matchNumber when nodeKey is absent', () => {
    const legacyBracket: readonly BracketMatch[] = [
      {
        matchId: 'm1',
        matchNumber: 1,
        roundNumber: 1,
        branch: 'winners',
        sourceFinalRound: 2,
        state: 'upcoming',
        slots: [],
      },
      {
        matchId: 'm3',
        matchNumber: 3,
        roundNumber: 2,
        branch: 'winners',
        sourceFinalRound: 2,
        state: 'upcoming',
        slots: [
          { kind: 'winner-of', matchId: 'm1' },
          { kind: 'winner-of', matchNumber: 2 },
        ],
      },
      {
        matchId: 'm4',
        matchNumber: 4,
        roundNumber: 2,
        branch: 'placement',
        role: 'place-3',
        nodeKey: 'placement-3',
        state: 'upcoming',
        slots: [
          { kind: 'loser-of', matchNumber: 1 },
          { kind: 'loser-of', matchNumber: 2 },
        ],
      },
    ];

    const lines = matchStakeLines({
      currentMatch: {
        matchId: 'm1',
        matchNumber: 1,
        stageNumber: 2,
        stageName: 'Copas',
        zoneName: 'Copa Oro',
        round: 1,
        sourceFinalRound: 2,
      },
      bracketMatches: legacyBracket,
      labels: stakeLabels,
    });

    expect(lines).toEqual([
      'El ganador juega Copa Oro · Ronda 2',
      'El perdedor juega Copa Oro · 3º puesto',
    ]);
  });

  it('states the settled place for a placement-5 match', () => {
    const lines = matchStakeLines({
      currentMatch: {
        nodeKey: 'placement-5',
        matchNumber: 13,
        stageNumber: 2,
        stageName: 'Copas',
        zoneName: 'Copa Oro',
        round: 2,
      },
      bracketMatches: cupBracket,
      labels: stakeLabels,
    });

    expect(lines).toEqual(['Define el 5º puesto']);
  });

  it('states the overall place alongside the cup place when overallPlaceOffset is provided', () => {
    const lines = matchStakeLines({
      currentMatch: {
        nodeKey: 'placement-5',
        matchNumber: 32,
        stageNumber: 2,
        stageName: 'Copas',
        zoneName: 'Copa Bronce',
        round: 2,
        overallPlaceOffset: 16,
      },
      bracketMatches: cupBracket,
      labels: stakeLabels,
    });

    expect(lines).toEqual(['Define el 5º puesto · 21.º general']);
  });

  it('states the zone championship for the final', () => {
    const lines = matchStakeLines({
      currentMatch: {
        nodeKey: 'SE-R3-M1',
        matchNumber: 15,
        stageNumber: 2,
        stageName: 'Copas',
        zoneName: 'Copa Oro',
        round: 3,
        sourceFinalRound: 3,
      },
      bracketMatches: cupBracket,
      labels: stakeLabels,
    });

    expect(lines).toEqual(['Define el campeón de Copa Oro']);
  });

  it('returns no lines for a round-robin match with no graph node or outgoing edges', () => {
    const lines = matchStakeLines({
      currentMatch: {
        matchNumber: 1,
        stageNumber: 1,
        stageName: 'Fase de grupos',
        round: 1,
      },
      bracketMatches: [],
      labels: stakeLabels,
    });

    expect(lines).toEqual([]);
  });
});

describe('buildMatchReport timeline', () => {
  const sided = (): PublicMatchReportResponse => ({
    ...report(),
    homeEntrantId: 'entrant-home',
    awayEntrantId: 'entrant-away',
    homeClubId: 'club-home',
    homeEmblemObjectId: 'emblem-home',
    streamUrl: 'https://example.org/live/semifinal-1',
    segments: [
      {
        number: 1,
        type: 'half',
        label: { en: 'Half', es: 'Tiempo' },
        timed: true,
        state: 'completed',
        scores: [1, 4],
      },
      {
        number: 2,
        type: 'half',
        label: { en: 'Half', es: 'Tiempo' },
        timed: true,
        state: 'active',
      },
    ],
    timeline: [
      {
        eventId: 'goal-away',
        definitionCode: 'goal',
        label: 'Goal',
        occurredAt: '2026-08-19T12:01:00.000Z',
        sequence: 1,
        segmentNumber: 1,
        segmentElapsedSeconds: 480,
        side: 'entrant-away',
        scoreAfter: [0, 1],
        personId: 'person-1',
        payload: {},
      },
      {
        eventId: 'goal-home',
        definitionCode: 'goal',
        label: 'Goal',
        occurredAt: '2026-08-19T12:03:00.000Z',
        sequence: 2,
        segmentNumber: 1,
        side: 'entrant-home',
        scoreAfter: [1, 1],
        payload: {},
      },
      {
        eventId: 'goal-second-half',
        definitionCode: 'goal',
        label: 'Goal',
        occurredAt: '2026-08-19T12:20:00.000Z',
        sequence: 3,
        segmentNumber: 2,
        side: 'entrant-away',
        payload: {},
      },
    ],
  });

  it('maps each side by its entrant id, not by its position in the timeline', () => {
    const model = build(sided());
    const [awayGoal, homeGoal] = model.timeline.flatMap((group) => group.events);

    expect(awayGoal?.side).toBe('away');
    expect(homeGoal?.side).toBe('home');
    expect(model.timeline.flatMap((group) => group.events).map((event) => event.side)).toEqual([
      'away',
      'home',
      'away',
    ]);
  });

  it('gives an event no side when its side matches neither entrant', () => {
    const response = sided();
    const model = build({
      ...response,
      timeline: response.timeline.slice(0, 1).map((event) => ({
        ...event,
        side: 'entrant-stranger',
      })),
    });
    expect(model.timeline[1]?.events[0]?.side).toBeUndefined();
  });

  it('carries the game time, the segment name and the running score on each event', () => {
    const model = build(sided());
    const goal = model.timeline.find(
      (group) => group.kind === 'single' && group.events[0]?.eventId === 'goal-away',
    )?.events[0];

    expect(goal).toMatchObject({
      segmentLabel: 'Half',
      segmentNumber: 1,
      elapsedSeconds: 480,
      scoreAfter: [0, 1],
    });
  });

  it('keeps an event without recorded elapsed time, and one without a score, unannotated', () => {
    const model = build(sided());
    const second = model.timeline
      .flatMap((group) => group.events)
      .find((event) => event.eventId === 'goal-second-half');

    expect(second?.elapsedSeconds).toBeUndefined();
    expect(second?.scoreAfter).toBeUndefined();
    expect(second?.segmentLabel).toBe('Half');
  });

  it('opens each segment with a marker and closes a completed one with its own score', () => {
    const kinds = build(sided()).timeline.map((group) =>
      group.kind === 'segment-start' || group.kind === 'segment-end'
        ? `${group.kind}:${group.segment?.number}`
        : group.kind,
    );

    expect(kinds).toEqual([
      'segment-start:1',
      'single',
      'single',
      'segment-end:1',
      'segment-start:2',
      'single',
    ]);
    const end = build(sided(), { locale: 'es' }).timeline.find(
      (group) => group.kind === 'segment-end',
    );
    expect(end?.segment).toEqual({ number: 1, label: 'Tiempo', scores: [1, 4] });
  });

  it('shows no segment score for a segment still in play', () => {
    const response = sided();
    const model = build({ ...response, timeline: response.timeline.slice(2) });
    expect(model.timeline.some((group) => group.kind === 'segment-end')).toBe(false);
  });

  it('adds no segment markers when the events name no segment', () => {
    const model = build(report());
    expect(
      model.timeline.every((group) => group.kind === 'single' || group.kind === 'workflow'),
    ).toBe(true);
  });

  it('reads the event time in its segment as mm:ss', () => {
    expect(formatElapsed(480)).toBe('08:00');
    expect(formatElapsed(4500)).toBe('75:00');
    expect(formatElapsed(0)).toBe('00:00');
  });
});

describe('buildMatchReport rosters and crests', () => {
  it('orders roster members by shirt number, then by name for members without one', () => {
    const response: PublicMatchReportResponse = {
      ...report(),
      rosters: {
        home: [
          { personId: 'p-10', number: 10, name: 'Zoe', onField: false },
          { personId: 'p-noname-b', name: 'Bruno', onField: false },
          { personId: 'p-9', number: 9, name: 'Ada', onField: false },
          { personId: 'p-noname-a', name: 'Alma', onField: false },
        ],
        away: [],
      },
    };

    const names = build(response).home.roster.map((member) => member.name);

    expect(names).toEqual(['Ada', 'Zoe', 'Alma', 'Bruno']);
  });

  it('sorts numbers as numbers and keeps the registered squad in the same order', () => {
    const ordered = sortRosterMembers(
      [{ number: 12, name: 'Twelve' }, { number: 2, name: 'Two' }, { name: 'Nameless' }],
      'en',
    );
    expect(ordered.map((member) => member.name)).toEqual(['Two', 'Twelve', 'Nameless']);
  });

  it('lists a registered squad for a side with no recorded roster, with the on-field state off', () => {
    const response: PublicMatchReportResponse = {
      ...report(),
      status: 'upcoming',
      rosters: { home: [], away: [] },
      registeredSquads: {
        home: [
          { personId: 'p-1', name: 'Ada', publicProfileAvailable: true },
          { hiddenAtRequest: true, publicProfileAvailable: false },
        ],
      },
    };

    const model = build(response);

    expect(model.home.roster).toEqual([]);
    expect(model.home.registeredSquad?.map((member) => member.name)).toEqual([
      'Ada',
      'Player hidden at their request',
    ]);
    expect(model.home.registeredSquad?.every((member) => member.onField === false)).toBe(true);
    expect(model.away.registeredSquad).toBeUndefined();
  });

  it('does not show a registered squad once a roster is recorded for the side', () => {
    const response: PublicMatchReportResponse = {
      ...report(),
      status: 'upcoming',
      rosters: { home: [{ personId: 'p-1', name: 'Ada', onField: false }], away: [] },
      registeredSquads: { home: [{ personId: 'p-2', name: 'Bea', publicProfileAvailable: true }] },
    };

    expect(build(response).home.registeredSquad).toBeUndefined();
  });

  it('shows a side crest only when its club and emblem are both known', () => {
    const withCrest = build({
      ...report(),
      homeClubId: 'club-home',
      homeEmblemObjectId: 'emblem-home',
    });
    const withoutCrest = build({ ...report(), homeClubId: 'club-home' });

    expect(withCrest.home.crestSrc).toContain('/clubs/club-home/emblem');
    expect(withoutCrest.home.crestSrc).toBeUndefined();
  });

  it('carries the stream link only when the match has one', () => {
    expect(build({ ...report(), streamUrl: 'https://example.org/live' }).streamUrl).toBe(
      'https://example.org/live',
    );
    expect(build(report()).streamUrl).toBeUndefined();
  });
});
