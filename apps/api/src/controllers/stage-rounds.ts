import { effectiveFormat, type TournamentFormat, type Zone } from '@copalibre/domain';

/** The formats whose next round is derived from the previous one, one explicit act at a time. */
const DYNAMIC_ROUND_FORMATS: readonly TournamentFormat[] = ['swiss', 'single-elimination'];

export function isDynamicRoundFormat(format: TournamentFormat): boolean {
  return DYNAMIC_ROUND_FORMATS.includes(format);
}

/** What a request for the next round resolves to, before any fixture is read. */
export type RoundZoneChoice =
  /** The zone whose fixtures, entrants and results the round is built from. */
  | { readonly kind: 'zone'; readonly zone: Zone }
  /** The stage declares no zone yet, so there is nothing zone-scoped to read. */
  | { readonly kind: 'none' }
  /** The caller named a zone number the stage does not have. */
  | { readonly kind: 'unknown'; readonly requested: number }
  /** The stage has several zones and the caller named none; these zone numbers could advance. */
  | { readonly kind: 'required'; readonly eligible: readonly number[] };

/**
 * Picks the zone a next-round request targets. A stage with one zone (every stage that predates
 * zones has exactly its implicit one) needs no naming; a stage with several must be told which,
 * because round numbers and results are per zone and a round must never mix entrants of two.
 */
export function chooseRoundZone(
  zones: readonly Zone[],
  stage: { readonly format: TournamentFormat },
  requestedNumber: number | undefined,
): RoundZoneChoice {
  if (requestedNumber !== undefined) {
    const named = zones.find((zone) => zone.number === requestedNumber);
    return named === undefined
      ? { kind: 'unknown', requested: requestedNumber }
      : { kind: 'zone', zone: named };
  }
  const [only] = zones;
  if (zones.length === 0) return { kind: 'none' };
  if (zones.length === 1 && only !== undefined) return { kind: 'zone', zone: only };
  return {
    kind: 'required',
    eligible: zones
      .filter((zone) => isDynamicRoundFormat(effectiveFormat(zone, stage)))
      .map((zone) => zone.number),
  };
}

/** The items belonging to `zone`; without a zone, all of them (the zoneless equivalence). */
export function inZone<T extends { readonly zoneId?: string }>(
  items: readonly T[],
  zone: Pick<Zone, 'zoneId'> | undefined,
): readonly T[] {
  return zone === undefined ? items : items.filter((item) => item.zoneId === zone.zoneId);
}
