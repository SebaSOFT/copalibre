import type { TournamentFormat } from '@copalibre/domain';

/** One zone as the planner sees it: its own format, if any, and the entrants drawn into it. */
export interface PlannedZoneInput {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly format?: TournamentFormat;
  readonly entrantIds: ReadonlySet<string>;
}

/** One fixture graph to generate: a zone's entrants in seed order, in that zone's format. */
export interface ZoneFixturePlan {
  /** Absent for the stage's single un-zoned graph, which is what every stage generated before zone formats. */
  readonly zoneId?: string;
  readonly format: TournamentFormat;
  readonly entrantIds: readonly string[];
}

/** The seed order cannot be split across the stage's zones. Carries a message an operator can act on. */
export class ZoneFixturePlanError extends Error {}

/**
 * Splits a stage's one flat seed order into the fixture graphs it generates.
 *
 * A stage whose zones have no entrants drawn into them yields one un-zoned graph in the stage's
 * format over every entrant, exactly as before zones could play their own format. Once entrants are
 * drawn into zones, each zone yields its own graph in its effective format (its own, else the
 * stage's), over its entrants in the flat order's relative order; a zone nobody was drawn into
 * yields none. An entrant seeded but drawn into no zone is refused rather than silently left out of
 * the competition.
 */
export function planZoneFixtures(input: {
  readonly stageFormat: TournamentFormat;
  readonly zones: readonly PlannedZoneInput[];
  readonly orderedEntrantIds: readonly string[];
}): readonly ZoneFixturePlan[] {
  const drawn = input.zones.filter((zone) => zone.entrantIds.size > 0);
  if (drawn.length === 0) {
    return [{ format: input.stageFormat, entrantIds: input.orderedEntrantIds }];
  }

  const assigned = new Set(drawn.flatMap((zone) => [...zone.entrantIds]));
  const unassigned = input.orderedEntrantIds.find((entrantId) => !assigned.has(entrantId));
  if (unassigned !== undefined) {
    throw new ZoneFixturePlanError(
      `Entrant ${unassigned} is not assigned to a zone; assign every entrant before generating fixtures`,
    );
  }

  return drawn.map((zone) => ({
    zoneId: zone.zoneId,
    format: zone.format ?? input.stageFormat,
    entrantIds: input.orderedEntrantIds.filter((entrantId) => zone.entrantIds.has(entrantId)),
  }));
}
