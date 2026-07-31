import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { segmentThresholdEventDefinitions } from '../descriptors/segment-threshold-events.js';
import { winConditionScript } from './win-condition-scripts.js';

/**
 * Seeded swimming module — the time-based heats reference.
 *
 * Swimming is the discipline that settles what qualification means, and it is
 * cited across three phases for it: you advance on **time across every heat**,
 * not on position within your heat, so winning a slow heat qualifies nobody.
 * That is why a placement match feeds the stage table and never another match.
 *
 * It therefore declares no placement points at all. Position inside a heat is
 * recorded because it is a fact worth keeping, but the statistic the cut ranks
 * on is `best-time`, aggregated with `min` — the fastest swim, not the sum of
 * them, which is what 0009's declared aggregation modes exist to express.
 */
export function swimmingDescriptor(
  overrides?: Partial<DisciplineDescriptor>,
): DisciplineDescriptor {
  const segmentTypes = ['heat'];
  return {
    descriptorId: '01890000-0000-7000-8000-00000000s001',
    version: '1.0.0',
    name: 'Swimming',
    attribution: {
      author: 'CopaLibre',
      licence: 'AGPL-3.0-only',
      sourceUrl: 'https://github.com/SebaSOFT/copalibre',
    },
    participantTypes: ['individual', 'team'],
    // A team here is a relay squad.
    rosterConstraints: { minPlayers: 1, maxPlayers: 4 },
    segmentTypes: [{ name: 'heat', label: 'Heat', timed: true }],
    eventDefinitions: [
      {
        code: 'finish',
        label: 'Finish',
        category: 'neutral',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'participant',
        payloadSchema: {
          type: 'object',
          properties: { centiseconds: { type: 'number' }, lane: { type: 'number' } },
          required: ['centiseconds'],
        },
      },
      {
        code: 'false-start',
        label: 'False start',
        category: 'negative',
        permittedSegmentTypes: segmentTypes,
        actorRequirement: 'participant',
        payloadSchema: { type: 'object', properties: {} },
      },
      ...segmentThresholdEventDefinitions(segmentTypes),
    ],
    statistics: [
      // Centiseconds as an integer: a time is compared and aggregated, never
      // formatted here — rendering it as 1:02.34 is the surface's job.
      { code: 'best-time', label: 'Best time', aggregation: 'min' },
      { code: 'heat-placement', label: 'Placement in heat', aggregation: 'min' },
      { code: 'heats', label: 'Heats swum', aggregation: 'count' },
    ],
    scoringInputs: [{ code: 'time', label: 'Time', source: 'operator-entered' }],
    availableFormats: ['heats', 'free-for-all'],
    notificationRuleCapabilities: ['threshold-count'],
    // Deliberately no placementScoring: swimming qualifies on the clock, and a
    // points-for-position table would quietly reintroduce the wrong contract.
    winCondition: winConditionScript('fastest-time', { unit: 'best-time' }),
    defaults: {
      scoring: { pointsPerWin: 0, pointsPerDraw: 0, pointsPerLoss: 0 },
      tiebreakers: ['best-time'],
      segments: { lanesPerHeat: 8 },
    },
    fieldPolicies: {
      tiebreakers: {
        permission: { kind: 'merged', strategy: 'union-list' },
        mutationClass: 'requires_rebuild',
      },
      segments: {
        permission: { kind: 'merged', strategy: 'shallow-object' },
        mutationClass: 'requires_rebuild',
      },
      winCondition: { permission: { kind: 'forbidden' }, mutationClass: 'safe' },
    },
    ...overrides,
  };
}
