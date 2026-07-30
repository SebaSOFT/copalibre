import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { segmentThresholdEventDefinitions } from '../descriptors/segment-threshold-events.js';
import { winConditionScript } from './win-condition-scripts.js';

/**
 * Seeded association-football module.
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
        actorRequirement: 'participant',
        payloadSchema: {
          type: 'object',
          properties: { assistedBy: { type: 'string' }, penalty: { type: 'boolean' } },
        },
        effects: [
          { kind: 'score', side: 'actor', delta: 1 },
          { kind: 'statistic', statisticCode: 'goals-for', delta: 1 },
        ],
      },
      {
        code: 'yellow-card',
        label: 'Yellow card',
        category: 'negative',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'participant',
        payloadSchema: { type: 'object', properties: { reason: { type: 'string' } } },
      },
      {
        code: 'red-card',
        label: 'Red card',
        category: 'negative',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'participant',
        payloadSchema: { type: 'object', properties: { reason: { type: 'string' } } },
      },
      ...segmentThresholdEventDefinitions(segmentTypes),
    ],
    statistics: [
      { code: 'goals-for', label: 'Goals for', aggregation: 'sum' },
      { code: 'goals-against', label: 'Goals against', aggregation: 'sum' },
      { code: 'wins', label: 'Wins', aggregation: 'sum' },
      { code: 'draws', label: 'Draws', aggregation: 'sum' },
      { code: 'losses', label: 'Losses', aggregation: 'sum' },
      { code: 'points', label: 'Points', aggregation: 'sum' },
      { code: 'played', label: 'Played', aggregation: 'count' },
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
      scoring: { pointsPerWin: 3, pointsPerDraw: 1, pointsPerLoss: 0 },
      tiebreakers: ['points', 'score-difference', 'goals-for'],
      segments: { regulationCount: 2, overtimeEnabled: false },
      venuePolicy: { neutralGround: false },
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
      'venuePolicy.neutralGround': { permission: { kind: 'inherited' }, mutationClass: 'safe' },
      // A cup tie cannot end level, so replacing the win condition is permitted.
      winCondition: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
    },
    ...overrides,
  };
}
