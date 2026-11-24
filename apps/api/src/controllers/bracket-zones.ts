import type { Kysely } from 'kysely';
import type { TournamentFormat } from '@copalibre/domain';
import type { Database } from '@copalibre/persistence';

/**
 * A stage's terminal-stage zone, or the implicit single zone every un-zoned
 * stage has. Shared by every reader that must project one bracket per zone
 * (`resolveTournamentWinners`, the public bracket and operator
 * seeding canvas) so the "no zones declared" fallback is defined exactly once.
 */
export interface StageZone {
  readonly zoneId?: string;
  readonly zoneName?: string;
  /** The zone's own format; absent means it plays its stage's (`effectiveFormat`). */
  readonly format?: TournamentFormat;
}

export function orderZonesByPromotionBands<
  Plan extends { readonly bands?: readonly { readonly zoneRef: string }[] },
>(zones: readonly StageZone[], plans: readonly Plan[]): readonly StageZone[] {
  const ordered: StageZone[] = [];
  const included = new Set<StageZone>();

  for (const plan of plans) {
    for (const band of plan.bands ?? []) {
      const zone = zones.find((candidate) => candidate.zoneName === band.zoneRef);
      if (zone !== undefined && !included.has(zone)) {
        included.add(zone);
        ordered.push(zone);
      }
    }
  }

  return ordered.length === 0
    ? zones
    : [...ordered, ...zones.filter((zone) => !included.has(zone))];
}

export interface PromotionBandRangeInput {
  readonly zoneRef: string;
  readonly count: number;
  readonly firstSeed?: number;
  readonly lastSeed?: number;
}

/**
 * 0-based overall place offset per declared zone name when incoming promotion bands
 * map 1-to-1 onto every declared zone with contiguous seed ranges starting at 1.
 * Returns an empty map otherwise so partial, overlapping, or unbanded stages state
 * no overall place.
 */
export function overallPlaceOffsetsForZones<
  Plan extends { readonly bands?: readonly PromotionBandRangeInput[] },
>(zones: readonly StageZone[], plans: readonly Plan[]): ReadonlyMap<string, number> {
  if (zones.length === 0 || plans.length === 0) return new Map();
  if (zones.some((zone) => zone.zoneName === undefined)) return new Map();
  if (plans.some((plan) => !plan.bands || plan.bands.length === 0)) return new Map();

  const zoneNames = new Set(zones.map((zone) => zone.zoneName as string));
  const ranges: {
    readonly zoneRef: string;
    readonly firstSeed: number;
    readonly lastSeed: number;
  }[] = [];

  for (const plan of plans) {
    let cursor = 1;
    for (const band of plan.bands ?? []) {
      if (!Number.isInteger(band.count) || band.count <= 0) return new Map();
      const firstSeed = band.firstSeed ?? cursor;
      const lastSeed = band.lastSeed ?? firstSeed + band.count - 1;
      if (
        !Number.isInteger(firstSeed) ||
        !Number.isInteger(lastSeed) ||
        firstSeed < 1 ||
        lastSeed !== firstSeed + band.count - 1
      ) {
        return new Map();
      }
      ranges.push({ zoneRef: band.zoneRef, firstSeed, lastSeed });
      cursor = lastSeed + 1;
    }
  }

  const offsets = new Map<string, number>();
  let expectedStart = 1;
  for (const range of [...ranges].sort((a, b) => a.firstSeed - b.firstSeed)) {
    if (!zoneNames.has(range.zoneRef) || offsets.has(range.zoneRef)) return new Map();
    if (range.firstSeed !== expectedStart) return new Map();
    offsets.set(range.zoneRef, range.firstSeed - 1);
    expectedStart = range.lastSeed + 1;
  }

  return offsets.size === zoneNames.size ? offsets : new Map();
}

/**
 * A stage's own zones, in declared order — or one implicit zone when none are
 * declared, so every caller's "for each zone" loop runs at least once and an
 * un-zoned stage is unaffected.
 */
export async function resolveStageZones(
  db: Kysely<Database>,
  stageId: string,
): Promise<readonly StageZone[]> {
  const rows = await db
    .selectFrom('zones')
    .selectAll()
    .where('stage_id', '=', stageId)
    .orderBy('number')
    .execute();

  return rows.length > 0
    ? rows.map((row) => ({
        zoneId: row.zone_id,
        zoneName: row.name,
        ...(row.format === null ? {} : { format: row.format as TournamentFormat }),
      }))
    : [{ zoneId: undefined, zoneName: undefined }];
}
