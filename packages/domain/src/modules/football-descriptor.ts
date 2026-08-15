import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { segmentThresholdEventDefinitions } from '../descriptors/segment-threshold-events.js';
import { winConditionScript } from './win-condition-scripts.js';

/**
 * Association-football descriptor builder for rules and engine tests.
 *
 * Every statistic the standings engine used to assume is declared here, which
 * is the point of 0009: the vocabulary belongs to the module, not to
 * `computeAccounting`. `played` aggregates as `count` (one per recorded
 * outcome); the rest sum. `score-difference` is deliberately absent — it is
 * derived at comparison time, and the audit trail keeps "what was recorded"
 * separable from "what was computed".
 */
export function footballDescriptor(
  overrides?: Partial<DisciplineDescriptor>,
): DisciplineDescriptor {
  const segmentTypes = ['half', 'extra-time'];
  return {
    descriptorId: '01890000-0000-7000-8000-00000000f001',
    alias: 'football',
    version: '1.0.0',
    name: 'Football',
    attribution: {
      author: 'CopaLibre',
      licence: 'AGPL-3.0-only',
      sourceUrl: 'https://github.com/SebaSOFT/copalibre',
    },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 11, maxPlayers: 11, maxSubstitutes: 12 },
    segmentTypes: [
      { name: 'half', label: 'Half', timed: true, defaultDurationSeconds: 2700 },
      { name: 'extra-time', label: 'Extra time', timed: true, defaultDurationSeconds: 900 },
    ],
    eventDefinitions: [
      {
        code: 'goal',
        label: 'Goal',
        category: 'positive',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'person',
        payloadSchema: {
          type: 'object',
          properties: {
            assistedBy: { type: 'string' },
            penalty: { type: 'boolean' },
            goalkeeperId: { type: 'string' },
          },
        },
        effects: [
          { kind: 'score', awardTo: 'actor', delta: 1 },
          { kind: 'statistic', statisticCode: 'goals-for', delta: 1 },
          {
            kind: 'statistic',
            statisticCode: 'goals-against',
            delta: 1,
            awardTo: 'every-other-side',
          },
          {
            kind: 'statistic',
            statisticCode: 'assists',
            delta: 1,
            awardTo: { payloadField: 'assistedBy' },
          },
          {
            kind: 'roster-role-snapshot',
            payloadField: 'goalkeeperId',
            role: 'goalkeeper',
            side: 'every-other-side',
          },
        ],
      },
      {
        code: 'own-goal',
        label: 'Own goal',
        category: 'negative',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'person',
        payloadSchema: { type: 'object', properties: {} },
        effects: [
          { kind: 'score', awardTo: 'every-other-side', delta: 1 },
          {
            kind: 'statistic',
            statisticCode: 'goals-for',
            delta: 1,
            awardTo: 'every-other-side',
          },
          { kind: 'statistic', statisticCode: 'goals-against', delta: 1 },
          { kind: 'statistic', statisticCode: 'player-own-goals', delta: 1 },
        ],
      },
      {
        code: 'substitution',
        label: 'Substitution',
        category: 'neutral',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'side',
        payloadSchema: {
          type: 'object',
          properties: { playerOutId: { type: 'string' }, playerInId: { type: 'string' } },
          required: ['playerOutId', 'playerInId'],
        },
        personPayloadFields: ['playerOutId', 'playerInId'],
      },
      {
        code: 'yellow-card',
        label: 'Yellow card',
        category: 'negative',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'person',
        payloadSchema: { type: 'object', properties: { reason: { type: 'string' } } },
      },
      {
        code: 'red-card',
        label: 'Red card',
        category: 'negative',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'person',
        payloadSchema: { type: 'object', properties: { reason: { type: 'string' } } },
      },
      ...segmentThresholdEventDefinitions(segmentTypes),
    ],
    statistics: [
      { code: 'goals-for', label: 'Goals for', aggregation: 'sum' },
      { code: 'goals-against', label: 'Goals against', aggregation: 'sum' },
      { code: 'player-own-goals', label: 'Own goals', aggregation: 'sum' },
      { code: 'assists', label: 'Assists', aggregation: 'sum' },
      { code: 'wins', label: 'Wins', aggregation: 'sum' },
      { code: 'draws', label: 'Draws', aggregation: 'sum' },
      { code: 'losses', label: 'Losses', aggregation: 'sum' },
      { code: 'points', label: 'Points', aggregation: 'sum' },
      { code: 'played', label: 'Played', aggregation: 'count' },
    ],
    rosterRoles: [
      { code: 'goalkeeper', label: 'Goalkeeper', badge: 'GK' },
      { code: 'captain', label: 'Captain', badge: 'C' },
    ],
    scoringInputs: [{ code: 'goals', label: 'Goals', source: 'event-derived' }],
    availableFormats: [
      'league',
      'round-robin',
      'round-robin-home-away',
      'round-robin-single-leg',
      'single-elimination',
      'double-elimination',
    ],
    notificationRuleCapabilities: ['threshold-count'],
    // No target: whoever leads on goals at full time takes the match, and level
    // sides draw. Cup ties override this where the field policy permits.
    winCondition: winConditionScript('football-win-condition', { unit: 'goals' }),
    defaults: {
      format: 'round-robin',
      registration: { publicOpen: false, requiresCheckIn: false },
      scoring: { pointsPerWin: 3, pointsPerDraw: 1, pointsPerLoss: 0 },
      tiebreakers: ['points', 'score-difference', 'goals-for'],
      segments: { regulationCount: 2, overtimeEnabled: false },
      venuePolicy: { neutralGround: false },
    },
    fieldPolicies: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
      'registration.publicOpen': { permission: { kind: 'replaced' }, mutationClass: 'safe' },
      'registration.requiresCheckIn': {
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      },
      'registration.checkInClosesAt': {
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      },
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
      'venuePolicy.neutralGround': { permission: { kind: 'inherited' }, mutationClass: 'safe' },
      // A cup tie cannot end level, so replacing the win condition is permitted.
      winCondition: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
    },
    ...overrides,
  };
}
