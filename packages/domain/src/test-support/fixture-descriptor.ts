import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';

/**
 * A fictional two-sided field-sport descriptor exercising every policy kind,
 * segment validation, actor requirements, payload schemas, and explicit
 * effects. Fictional names only — no real sport/esport branding.
 */
export function fixtureDescriptor(overrides?: Partial<DisciplineDescriptor>): DisciplineDescriptor {
  return {
    descriptorId: '01890000-0000-7000-8000-000000000001',
    alias: 'orbital-field',
    version: '3.0.0',
    name: 'Orbital Field',
    attribution: {
      author: 'CopaLibre test fixtures',
      licence: 'AGPL-3.0-only',
      sourceUrl: 'https://github.com/SebaSOFT/copalibre',
    },
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
        actorRequirement: 'person',
        payloadSchema: {
          type: 'object',
          properties: {
            distanceMeters: { type: 'number' },
            zone: { enum: ['inner', 'outer'] },
          },
          required: ['zone'],
        },
        effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
      },
      {
        code: 'caution',
        label: 'Caution',
        category: 'negative',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'person',
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
    // A rule script since the highest strike count at full time takes the
    // match. No target, so the match closes on completion rather than on a side
    // reaching a number — the shape a timed field sport needs.
    winCondition: {
      id: 'orbital-field-win-condition',
      rules: [
        {
          id: 'higher-strike-count-wins',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [
            {
              id: 'close-match',
              type: 'winMatch',
              options: {},
              params: [
                { id: 'unit', name: 'unit', type: 'simple_string', value: 'strikes', options: {} },
              ],
            },
          ],
        },
      ],
    },
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
      series: {
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      },
      'series.span': {
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      },
      'series.resolutionClass': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
      'series.resolutionScript': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
      'series.neutralGround': {
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      },
      'series.standingsAccounting': {
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      },
    },
    ...overrides,
  };
}
