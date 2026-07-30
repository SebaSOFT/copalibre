import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';

/**
 * A fictional two-sided field-sport descriptor exercising every policy kind,
 * segment validation, actor requirements, payload schemas, and explicit
 * effects. Fictional names only — no real sport/esport branding.
 */
export function fixtureDescriptor(overrides?: Partial<DisciplineDescriptor>): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-000000000001',
    version: 3,
    name: 'Orbital Field',
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 5, maxPlayers: 9, maxSubstitutes: 4 },
    segmentTypes: [
      { name: 'half', label: 'Half', timed: true, defaultDurationSeconds: 1200 },
      { name: 'overtime', label: 'Overtime', timed: true, defaultDurationSeconds: 300 },
    ],
    eventDefinitions: [
      {
        code: 'strike',
        label: 'Strike',
        category: 'positive',
        permittedSegmentTypes: ['half', 'overtime'],
        actorRequirement: 'participant',
        payloadSchema: {
          type: 'object',
          properties: {
            distanceMeters: { type: 'number' },
            zone: { enum: ['inner', 'outer'] },
          },
          required: ['zone'],
        },
        effects: [{ kind: 'score', side: 'actor', delta: 1 }],
      },
      {
        code: 'caution',
        label: 'Caution',
        category: 'negative',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'participant',
        payloadSchema: {
          type: 'object',
          properties: { reason: { type: 'string' } },
          required: ['reason'],
        },
        // Deliberately NO effects: category must never imply one.
      },
      {
        code: 'pause',
        label: 'Operational Pause',
        category: 'neutral',
        permittedSegmentTypes: ['half', 'overtime'],
        actorRequirement: 'none',
        payloadSchema: { type: 'object', properties: {} },
      },
    ],
    statistics: [{ code: 'strikes', label: 'Strikes', aggregation: 'sum' }],
    scoringInputs: [{ code: 'score', label: 'Score', source: 'event-derived' }],
    availableFormats: ['round-robin', 'single-elimination'],
    notificationRuleCapabilities: ['threshold-count'],
    defaults: {
      scoring: { pointsPerWin: 3, pointsPerDraw: 1 },
      tiebreakers: ['points', 'score-difference'],
      segments: { regulationCount: 2, overtimeEnabled: false },
      venuePolicy: { neutralGround: false },
      identityRules: { federationCode: 'ORB-1' },
    },
    fieldPolicies: {
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
      'scoring.pointsPerDraw': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
      tiebreakers: {
        permission: { kind: 'merged', strategy: 'union-list' },
        mutationClass: 'requires_rebuild',
      },
      segments: {
        permission: { kind: 'merged', strategy: 'shallow-object' },
        mutationClass: 'requires_rebuild',
      },
      'venuePolicy.neutralGround': {
        permission: { kind: 'inherited' },
        mutationClass: 'safe',
      },
      'identityRules.federationCode': {
        permission: { kind: 'forbidden' },
        mutationClass: 'safe',
      },
      noteTemplates: {
        permission: { kind: 'merged', strategy: 'append-list' },
        mutationClass: 'safe',
      },
    },
    ...overrides,
  };
}
