import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { segmentThresholdEventDefinitions } from '../descriptors/segment-threshold-events.js';
import { winConditionScript } from './win-condition-scripts.js';

/**
 * Seeded tennis module — the nested-scoring reference implementation.
 *
 * Tennis is the discipline that broke the pre-0009 model: one match produces
 * three levels of score at once (matches, sets, games), and a single scalar
 * could carry none of them. It declares a statistic at every level it scores
 * at, which is what lets a profile bind `primary-scoring → matches-won`,
 * `secondary-scoring → sets-won` and `tertiary-scoring → games-won` and have
 * all three read real values instead of degrading through `missingValue`.
 *
 * Scoring rules (LTA/USTA): a set is first to 6 games with a 2-game margin, so
 * 6-4 closes and 6-5 plays on to 7-5; at 6-6 a tiebreak to 7 points with a
 * 2-point margin decides it and the set is recorded 7-6. A match is first to N
 * sets with no margin requirement, so 2-1 wins a best-of-three.
 */
export function tennisDescriptor(overrides?: Partial<DisciplineDescriptor>): DisciplineDescriptor {
  const segmentTypes = ['set', 'tiebreak'];
  return {
    descriptorId: '01890000-0000-7000-8000-00000000t001',
    version: '1.0.0',
    name: 'Tennis',
    attribution: {
      author: 'CopaLibre',
      licence: 'AGPL-3.0-only',
      sourceUrl: 'https://github.com/SebaSOFT/copalibre',
    },
    participantTypes: ['individual', 'team'],
    // A team here is a doubles pair; singles is one player.
    rosterConstraints: { minPlayers: 1, maxPlayers: 2 },
    segmentTypes: [
      { name: 'set', label: 'Set', timed: false },
      { name: 'tiebreak', label: 'Tiebreak', timed: false },
    ],
    eventDefinitions: [
      {
        code: 'point',
        label: 'Point',
        category: 'positive',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'person',
        payloadSchema: {
          type: 'object',
          properties: { ace: { type: 'boolean' }, doubleFault: { type: 'boolean' } },
        },
        effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
      },
      {
        code: 'game-won',
        label: 'Game won',
        category: 'positive',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'person',
        payloadSchema: { type: 'object', properties: { toLove: { type: 'boolean' } } },
        effects: [{ kind: 'statistic', statisticCode: 'games-won', delta: 1 }],
      },
      ...segmentThresholdEventDefinitions(segmentTypes),
    ],
    statistics: [
      { code: 'matches-won', label: 'Matches won', aggregation: 'sum' },
      { code: 'matches-lost', label: 'Matches lost', aggregation: 'sum' },
      { code: 'sets-won', label: 'Sets won', aggregation: 'sum' },
      { code: 'sets-lost', label: 'Sets lost', aggregation: 'sum' },
      { code: 'games-won', label: 'Games won', aggregation: 'sum' },
      { code: 'games-lost', label: 'Games lost', aggregation: 'sum' },
      { code: 'played', label: 'Played', aggregation: 'count' },
    ],
    scoringInputs: [
      { code: 'games', label: 'Games', source: 'event-derived' },
      { code: 'sets', label: 'Sets', source: 'event-derived' },
    ],
    availableFormats: [
      'single-elimination',
      'double-elimination',
      'round-robin',
      'round-robin-single-leg',
    ],
    notificationRuleCapabilities: ['threshold-count'],
    winCondition: winConditionScript('tennis-best-of-three', { unit: 'set', target: 2 }, [
      {
        segment: 'set',
        target: 6,
        margin: 2,
        tiebreakAt: 6,
        tiebreakTarget: 7,
        tiebreakMargin: 2,
      },
    ]),
    defaults: {
      scoring: { pointsPerWin: 2, pointsPerDraw: 0, pointsPerLoss: 0 },
      // Cascades matches → sets → games, which is exactly the three-way tie the
      // pre-0009 accounting could not break.
      tiebreakers: ['matches-won', 'sets-won', 'games-won'],
      segments: { bestOf: 3, tiebreakInFinalSet: true },
    },
    fieldPolicies: {
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
      tiebreakers: {
        permission: { kind: 'merged', strategy: 'union-list' },
        mutationClass: 'requires_rebuild',
      },
      // Best-of-five is a different win condition, and a tournament may set it.
      winCondition: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
      segments: {
        permission: { kind: 'merged', strategy: 'shallow-object' },
        mutationClass: 'requires_rebuild',
      },
    },
    ...overrides,
  };
}

/** Best-of-five: the same set rule, three sets to take the match. */
export function bestOfFiveWinCondition() {
  return winConditionScript('tennis-best-of-five', { unit: 'set', target: 3 }, [
    {
      segment: 'set',
      target: 6,
      margin: 2,
      tiebreakAt: 6,
      tiebreakTarget: 7,
      tiebreakMargin: 2,
    },
  ]);
}
