/**
 * Shared mock data for a tournament with a group stage followed by a cup, used by the public
 * navigation specs. The stage facts match the overview model's `stages` list, and the layout list
 * declares the group-phase standings view that the Posiciones tab links to.
 */

export const STAGED_OVERVIEW_STAGES = [
  {
    stageNumber: 1,
    stageName: 'Grupos',
    format: 'round-robin',
    zones: [{ zoneName: 'Grupos', format: 'round-robin' }],
  },
  {
    stageNumber: 2,
    stageName: 'Copas',
    format: 'single-elimination',
    zones: [{ zoneName: 'Copa Oro', format: 'single-elimination' }],
  },
];

export const STAGED_TABLE_LAYOUTS = {
  layouts: [
    {
      code: 'group-standings-default',
      target: 'group-phase',
      label: 'Posiciones',
      entityGranularity: 'team',
    },
  ],
};

/** The overview with the stage list added; `base` carries the page's other overview fields. */
export function withStages<T extends object>(
  base: T,
): T & { stages: typeof STAGED_OVERVIEW_STAGES } {
  return { ...base, stages: STAGED_OVERVIEW_STAGES };
}

/** The stage's bracket response: a league stage has one round-robin zone, a cup one bracket zone. */
export function stagedBracket(stageNumber: number): unknown {
  const stage = STAGED_OVERVIEW_STAGES.find((one) => one.stageNumber === stageNumber);
  if (stage === undefined) return undefined;
  return {
    format: stage.format,
    zones: stage.zones.map((zone) => ({ ...zone, matches: [] })),
  };
}
