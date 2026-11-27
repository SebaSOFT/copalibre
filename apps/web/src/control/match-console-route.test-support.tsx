import type { MatchConsoleApiClient, MatchConsoleResponse } from './lib/api-client.js';

export const projection: MatchConsoleResponse = {
  segmentPlan: { addable: [] },
  matchId: 'match-1',
  stageNumber: 1,
  status: 'in-progress',
  result: null,
  liveScores: [
    { entrantId: 'entrant-a', score: 1, statistics: { goals: 1 } },
    { entrantId: 'entrant-b', score: 0, statistics: {} },
  ],
  segments: [
    {
      segmentId: 'segment-1',
      type: 'half',
      number: 1,
      state: 'active',
      elapsedSeconds: 120,
      durationSeconds: 2700,
    },
  ],
  runningTimers: [],
  events: [
    {
      eventId: 'event-1',
      definitionCode: 'goal',
      segmentId: 'segment-1',
      sequence: 1,
      occurredAt: '2026-08-03T20:00:00.000Z',
      side: 'entrant-a',
    },
  ],
  eventDefinitions: [
    {
      code: 'penalty-decision',
      label: 'Penal',
      category: 'neutral',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object' },
      display: {},
      secondaryActorFields: [],
      workflow: {
        kind: 'outcome-choice',
        options: [
          { definitionCode: 'penalty-goal', label: 'Gol' },
          { definitionCode: 'penalty-missed', label: 'Fallado' },
        ],
      },
    },
    {
      code: 'penalty-goal',
      label: 'Gol de penal',
      category: 'positive',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object', properties: { description: { type: 'string' } } },
      display: {},
      secondaryActorFields: [],
    },
    {
      code: 'penalty-missed',
      label: 'Penal fallado',
      category: 'negative',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object' },
      display: {},
      secondaryActorFields: [],
    },
    {
      code: 'goal',
      label: 'Gol',
      category: 'positive',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object' },
      display: {},
      secondaryActorFields: [],
    },
    {
      code: 'technical-warning',
      label: 'Advertencia técnica',
      category: 'negative',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'person-or-staff',
      payloadSchema: { type: 'object' },
      display: {},
      secondaryActorFields: [],
    },
  ],
  eligiblePersonIds: [],
  rosters: [
    {
      entrantId: 'entrant-a',
      members: [{ personId: 'person-a1', name: 'Home One', onField: true }],
    },
    {
      entrantId: 'entrant-b',
      members: [{ personId: 'person-b1', name: 'Away One', onField: true }],
    },
  ],
  rosterRoles: [],
  eligibleStaffIds: ['staff-1'],
  entrants: [
    { entrantId: 'entrant-a', name: 'Club Atlético', abbreviation: 'CAT' },
    { entrantId: 'entrant-b', name: 'Deportivo Cuyo', abbreviation: 'DCU' },
  ],
  capabilities: ['match.record-event', 'match.control-clock', 'match.finalize'],
  projectionVersion: 1,
};

export function client(overrides: Partial<MatchConsoleApiClient> = {}): MatchConsoleApiClient {
  return {
    fetchTournamentSettings: async () => ({
      name: 'Apertura 2026',
      featured: false,
      includesMinors: false,
      showYouthProfiles: false,
    }),
    fetchMatchConsole: async () => projection,
    fetchMatchRosters: async () => [],
    fetchRosterCandidates: async () => [],
    setMatchRoster: async () => projection,
    adjustMatchClock: async () => projection,
    resolveMatchTimer: async () => projection,
    addMatchSegment: async () => {
      throw new Error('not used in this test');
    },
    reopenMatchSegment: async () => {
      throw new Error('not used in this test');
    },
    sendMatchCommand: async () => ({
      matchId: 'match-1',
      status: 'in-progress',
      clockRunning: true,
      runningTimers: [],
    }),
    recordMatchEvent: async () => ({
      eventId: 'event-2',
      definitionCode: 'penalty-goal',
      sequence: 2,
      notifications: [],
    }),
    finalizeMatch: async () => ({
      matchId: 'match-1',
      status: 'finalized',
      clockRunning: false,
      runningTimers: [],
    }),
    bulkLoadMatch: async () => ({ matchId: 'match-1', status: 'finalized', eventCount: 0 }),
    ...overrides,
  };
}

export const FIRST_SEGMENT: MatchConsoleResponse['segments'][number] = {
  segmentId: 'segment-1',
  type: 'half',
  number: 1,
  state: 'active',
  elapsedSeconds: 120,
  durationSeconds: 2700,
};

/** The console's one always-visible connectivity signal; its detail opens on focus or hover. */
export function syncIndicator(): HTMLElement {
  const indicator = document.querySelector<HTMLElement>('.cl-connection-status');
  if (!indicator) throw new Error('Missing persistent connection status');
  return indicator;
}
