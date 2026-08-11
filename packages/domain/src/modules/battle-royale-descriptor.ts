import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { segmentThresholdEventDefinitions } from '../descriptors/segment-threshold-events.js';
import { winConditionScript } from './win-condition-scripts.js';

/**
 * Battle-royale descriptor builder — the placement-scoring reference.
 *
 * Its scoring is the shape the whole placement format exists for: points for
 * where you finished, plus points for what you did. The first half is
 * structural and comes from `placementScoring`; the second is `frags`, an
 * ordinary declared statistic that 0009's accounting already sums. Nothing in
 * the engine knows which is which — the standings add both.
 *
 * The table stops at tenth because that is what these formats actually do: a
 * lobby of sixty awards nothing below the top ten, which `beyondTable` states
 * outright rather than leaving to a missing row.
 */
export function battleRoyaleDescriptor(
  overrides?: Partial<DisciplineDescriptor>,
): DisciplineDescriptor {
  const segmentTypes = ['lobby'];
  return {
    descriptorId: '01890000-0000-7000-8000-00000000b001',
    alias: 'battle-royale',
    version: '1.0.0',
    name: 'Battle Royale',
    attribution: {
      author: 'CopaLibre',
      licence: 'AGPL-3.0-only',
      sourceUrl: 'https://github.com/SebaSOFT/copalibre',
    },
    participantTypes: ['individual', 'team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 4 },
    segmentTypes: [{ name: 'lobby', label: 'Lobby', timed: false }],
    eventDefinitions: [
      {
        code: 'elimination',
        label: 'Elimination',
        category: 'positive',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'person',
        payloadSchema: {
          type: 'object',
          properties: { weapon: { type: 'string' }, distanceMeters: { type: 'number' } },
        },
        effects: [{ kind: 'statistic', statisticCode: 'frags', delta: 1 }],
      },
      {
        code: 'downed',
        label: 'Downed',
        category: 'negative',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'person',
        payloadSchema: { type: 'object', properties: {} },
        effects: [{ kind: 'statistic', statisticCode: 'deaths', delta: 1 }],
      },
      ...segmentThresholdEventDefinitions(segmentTypes),
    ],
    statistics: [
      { code: 'placement-points', label: 'Placement points', aggregation: 'sum' },
      { code: 'frags', label: 'Frags', aggregation: 'sum' },
      { code: 'deaths', label: 'Deaths', aggregation: 'sum' },
      { code: 'best-placement', label: 'Best placement', aggregation: 'min' },
      { code: 'lobbies', label: 'Lobbies played', aggregation: 'count' },
    ],
    scoringInputs: [
      { code: 'placement', label: 'Placement', source: 'operator-entered' },
      { code: 'frags', label: 'Frags', source: 'event-derived' },
    ],
    availableFormats: ['free-for-all', 'heats'],
    notificationRuleCapabilities: ['threshold-count'],
    placementScoring: {
      statisticCode: 'placement-points',
      table: [
        { placement: 1, points: 12 },
        { placement: 2, points: 9 },
        { placement: 3, points: 7 },
        { placement: 4, points: 5 },
        { placement: 5, points: 4 },
        { placement: 6, points: 3 },
        { placement: 7, points: 3 },
        { placement: 8, points: 2 },
        { placement: 9, points: 2 },
        { placement: 10, points: 1 },
      ],
      beyondTable: 0,
    },
    // A lobby is won by the side left standing; the stage is decided by the
    // table, which is why the cut and not this condition qualifies anyone.
    winCondition: winConditionScript('last-side-standing', { unit: 'placement-points' }),
    defaults: {
      format: 'free-for-all',
      registration: { publicOpen: false, requiresCheckIn: false },
      scoring: { pointsPerWin: 0, pointsPerDraw: 0, pointsPerLoss: 0 },
      tiebreakers: ['placement-points', 'frags', 'best-placement'],
      segments: { roundsPerStage: 6, lobbySize: 20 },
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
      tiebreakers: {
        permission: { kind: 'merged', strategy: 'union-list' },
        mutationClass: 'requires_rebuild',
      },
      segments: {
        permission: { kind: 'merged', strategy: 'shallow-object' },
        mutationClass: 'requires_rebuild',
      },
      // Circuits routinely publish their own points table.
      placementScoring: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
      winCondition: { permission: { kind: 'forbidden' }, mutationClass: 'safe' },
    },
    ...overrides,
  };
}
