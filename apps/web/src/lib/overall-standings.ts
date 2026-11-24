import { championshipMatch, nodeOutcomes, type BracketMatch, type SlotSource } from './bracket.js';

export interface OverallStandingsZoneInput {
  readonly zoneName?: string;
  readonly overallPlaceOffset?: number;
  readonly matches: readonly BracketMatch[];
}

export interface OverallStandingsEntry {
  readonly entrantId?: string;
  readonly name: string;
  readonly abbreviation?: string;
  readonly clubId?: string;
  readonly emblemObjectId?: string;
  readonly zoneName?: string;
  readonly zonePlaceFrom: number;
  readonly zonePlaceTo?: number;
  readonly overallPlaceFrom: number;
  readonly overallPlaceTo?: number;
}

export interface PromotionBandOffsetInput {
  readonly zoneRef: string;
  readonly count: number;
  readonly firstSeed?: number;
  readonly lastSeed?: number;
}

/**
 * Returns the overall 1-based place for a place within a zone, or `undefined`
 * when the zone carries no `overallPlaceOffset`.
 */
export function overallPlace(
  zonePlace: number,
  overallPlaceOffset: number | undefined,
): number | undefined {
  return overallPlaceOffset === undefined ? undefined : overallPlaceOffset + zonePlace;
}

/**
 * Computes 0-based overall place offsets per zone when bands map 1-to-1 onto
 * every declared zone with contiguous ranges starting at 1. Returns an empty
 * map if any band overlaps, gaps, or fails to map 1-to-1.
 */
export function computeOverallPlaceOffsets(
  zoneNames: readonly (string | undefined)[],
  bands: readonly PromotionBandOffsetInput[],
): ReadonlyMap<string, number> {
  if (zoneNames.length === 0 || bands.length === 0) return new Map();
  if (zoneNames.some((name) => name === undefined)) return new Map();
  const declared = new Set(zoneNames as readonly string[]);
  const normalized: {
    readonly zoneRef: string;
    readonly firstSeed: number;
    readonly lastSeed: number;
  }[] = [];
  let cursor = 1;
  for (const band of bands) {
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
    normalized.push({ zoneRef: band.zoneRef, firstSeed, lastSeed });
    cursor = lastSeed + 1;
  }

  const offsets = new Map<string, number>();
  let expectedStart = 1;
  for (const band of [...normalized].sort((a, b) => a.firstSeed - b.firstSeed)) {
    if (!declared.has(band.zoneRef) || offsets.has(band.zoneRef)) return new Map();
    if (band.firstSeed !== expectedStart) return new Map();
    offsets.set(band.zoneRef, band.firstSeed - 1);
    expectedStart = band.lastSeed + 1;
  }
  return offsets.size === declared.size ? offsets : new Map();
}

type EntrantMeta = {
  readonly key: string;
  readonly entrantId?: string;
  readonly name: string;
  readonly abbreviation?: string;
  readonly clubId?: string;
  readonly emblemObjectId?: string;
};

function entrantKeyOf(slot: Extract<SlotSource, { kind: 'entrant' }>): string {
  return slot.entrantId ?? `name:${slot.name}`;
}

function singlePlacementOf(match: BracketMatch): number | undefined {
  for (const candidate of [match.nodeKey, match.role]) {
    const parsed = /^(?:placement|place)-(\d+)$/.exec(candidate ?? '');
    if (parsed) return Number(parsed[1]);
  }
  return undefined;
}

type PlaceAssignment = { readonly from: number; readonly to?: number };

function toEntrantMeta(slot: Extract<SlotSource, { kind: 'entrant' }>): EntrantMeta {
  return {
    key: entrantKeyOf(slot),
    ...(slot.entrantId === undefined ? {} : { entrantId: slot.entrantId }),
    name: slot.name,
    ...(slot.abbreviation === undefined ? {} : { abbreviation: slot.abbreviation }),
    ...(slot.clubId === undefined ? {} : { clubId: slot.clubId }),
    ...(slot.emblemObjectId === undefined ? {} : { emblemObjectId: slot.emblemObjectId }),
  };
}

function resolveDecidedPair(
  match: BracketMatch,
):
  | { readonly winner: EntrantMeta; readonly loser: EntrantMeta }
  | { readonly tied: readonly EntrantMeta[] }
  | undefined {
  const slots = match.slots.filter(
    (slot): slot is Extract<SlotSource, { kind: 'entrant' }> => slot.kind === 'entrant',
  );
  if (slots.length !== 2) return undefined;
  const metas = slots.map(toEntrantMeta);

  const outcomes = nodeOutcomes(match);
  const winnerIndex = outcomes.indexOf('advancing');
  const loserIndex = outcomes.indexOf('eliminated');
  if (winnerIndex >= 0 && loserIndex >= 0 && metas[winnerIndex] && metas[loserIndex]) {
    return { winner: metas[winnerIndex], loser: metas[loserIndex] };
  }
  return { tied: metas };
}

function collectZoneEntrants(matches: readonly BracketMatch[]): {
  readonly entrants: ReadonlyMap<string, EntrantMeta>;
  readonly highestRound: ReadonlyMap<string, number>;
} {
  const entrants = new Map<string, EntrantMeta>();
  const highestRound = new Map<string, number>();
  for (const match of matches) {
    const isMainRound = match.branch !== 'placement' && !/^PL\d+-/.test(match.nodeKey ?? '');
    for (const slot of match.slots) {
      if (slot.kind !== 'entrant') continue;
      const key = entrantKeyOf(slot);
      if (!entrants.has(key)) entrants.set(key, toEntrantMeta(slot));
      if (isMainRound) {
        highestRound.set(key, Math.max(highestRound.get(key) ?? 0, match.roundNumber));
      }
    }
  }
  return { entrants, highestRound };
}

function assignMatchOutcome(
  assigned: Map<string, PlaceAssignment>,
  match: BracketMatch,
  winnerPlace: number,
): void {
  const assign = (key: string, from: number, to?: number) => {
    if (!assigned.has(key)) assigned.set(key, to === undefined ? { from } : { from, to });
  };
  const resolved = resolveDecidedPair(match);
  if (!resolved) return;
  if ('winner' in resolved) {
    assign(resolved.winner.key, winnerPlace);
    assign(resolved.loser.key, winnerPlace + 1);
  } else {
    for (const entrant of resolved.tied) assign(entrant.key, winnerPlace, winnerPlace + 1);
  }
}

function assignEliminatedByRound(
  assigned: Map<string, PlaceAssignment>,
  entrants: ReadonlyMap<string, EntrantMeta>,
  highestRound: ReadonlyMap<string, number>,
): void {
  const unplaced = [...entrants.values()].filter((entrant) => !assigned.has(entrant.key));
  if (unplaced.length === 0) return;

  const takenPlaces = new Set<number>();
  for (const place of assigned.values()) {
    const end = place.to ?? place.from;
    for (let value = place.from; value <= end; value += 1) takenPlaces.add(value);
  }

  const byRound = new Map<number, EntrantMeta[]>();
  for (const entrant of unplaced) {
    const round = highestRound.get(entrant.key) ?? 0;
    const bucket = byRound.get(round) ?? [];
    bucket.push(entrant);
    byRound.set(round, bucket);
  }

  let nextFree = 1;
  for (const round of [...byRound.keys()].sort((a, b) => b - a)) {
    const group = byRound.get(round) ?? [];
    while (takenPlaces.has(nextFree)) nextFree += 1;
    const from = nextFree;
    const to = group.length > 1 ? from + group.length - 1 : undefined;
    for (const entrant of group) {
      assigned.set(entrant.key, to === undefined ? { from } : { from, to });
    }
    for (let value = from; value <= (to ?? from); value += 1) takenPlaces.add(value);
    nextFree = (to ?? from) + 1;
  }
}

function toOverallEntry(
  entrant: EntrantMeta,
  place: PlaceAssignment,
  offset: number,
  zoneName: string | undefined,
): OverallStandingsEntry {
  return {
    ...(entrant.entrantId === undefined ? {} : { entrantId: entrant.entrantId }),
    name: entrant.name,
    ...(entrant.abbreviation === undefined ? {} : { abbreviation: entrant.abbreviation }),
    ...(entrant.clubId === undefined ? {} : { clubId: entrant.clubId }),
    ...(entrant.emblemObjectId === undefined ? {} : { emblemObjectId: entrant.emblemObjectId }),
    ...(zoneName === undefined ? {} : { zoneName }),
    zonePlaceFrom: place.from,
    ...(place.to === undefined ? {} : { zonePlaceTo: place.to }),
    overallPlaceFrom: offset + place.from,
    ...(place.to === undefined ? {} : { overallPlaceTo: offset + place.to }),
  };
}

function zoneStandingsOf(zone: OverallStandingsZoneInput): readonly OverallStandingsEntry[] {
  const offset = zone.overallPlaceOffset;
  if (offset === undefined || zone.matches.length === 0) return [];
  if (zone.matches.some((match) => match.state !== 'final')) return [];

  const { entrants, highestRound } = collectZoneEntrants(zone.matches);
  const assigned = new Map<string, PlaceAssignment>();

  const finalMatch = championshipMatch(zone.matches);
  if (finalMatch) assignMatchOutcome(assigned, finalMatch, 1);

  for (const match of zone.matches) {
    const place = singlePlacementOf(match);
    if (place !== undefined) assignMatchOutcome(assigned, match, place);
  }

  assignEliminatedByRound(assigned, entrants, highestRound);

  return [...entrants.values()]
    .map((entrant) => {
      const place = assigned.get(entrant.key);
      return place === undefined
        ? undefined
        : toOverallEntry(entrant, place, offset, zone.zoneName);
    })
    .filter((entry): entry is OverallStandingsEntry => entry !== undefined);
}

/**
 * Builds the overall standings of a finished banded knockout stage.
 * Returns an empty list unless every non-empty zone carries `overallPlaceOffset`
 * and every match across those zones is final.
 */
export function deriveOverallStandings(
  zones: readonly OverallStandingsZoneInput[],
): readonly OverallStandingsEntry[] {
  const activeZones = zones.filter((zone) => zone.matches.length > 0);
  if (activeZones.length === 0) return [];
  if (activeZones.some((zone) => zone.overallPlaceOffset === undefined)) return [];
  if (activeZones.some((zone) => zone.matches.some((match) => match.state !== 'final'))) return [];

  return activeZones
    .flatMap(zoneStandingsOf)
    .sort(
      (left, right) =>
        left.overallPlaceFrom - right.overallPlaceFrom ||
        (left.overallPlaceTo ?? left.overallPlaceFrom) -
          (right.overallPlaceTo ?? right.overallPlaceFrom) ||
        left.name.localeCompare(right.name),
    );
}
