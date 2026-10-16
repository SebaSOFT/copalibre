import type { RecordedOutcome, SeriesDeclaration } from '@copalibre/domain';

/** JSON-compatible source persisted for one side of a fixture graph node. */
export type FixtureGraphSlotSource =
  | { readonly kind: 'entrant'; readonly entrantId: string; readonly seed: number }
  | { readonly kind: 'bye' }
  | { readonly kind: 'qualifier'; readonly promotionPlanId: string; readonly position: number }
  | { readonly kind: 'winner-of'; readonly matchId: string }
  | { readonly kind: 'loser-of'; readonly matchId: string }
  | { readonly kind: 'placement-top'; readonly matchId: string; readonly rank: number };

export type FixtureGraphBracket =
  'winners' | 'losers' | 'grand-final' | 'round-robin' | 'placement' | 'bracket-groups' | 'custom';

/** Structural port shape. Kept independent of the tournament-engine package. */
export interface PersistedFixtureNode {
  readonly nodeKey: string;
  readonly bracket: FixtureGraphBracket;
  readonly round: number;
  readonly position: number;
  readonly branch?: string;
  readonly label?: string;
  readonly sides: readonly [FixtureGraphSlotSource, FixtureGraphSlotSource];
  readonly seriesSpan: number;
  readonly contingency?: 'bracket-reset';
}

export type ResolvedFixtureSide =
  | { readonly state: 'entrant'; readonly entrantId: string }
  | { readonly state: 'empty' }
  | { readonly state: 'pending' };

export interface PersistedFixtureResolution {
  readonly nodeKey: string;
  readonly sides: readonly [ResolvedFixtureSide, ResolvedFixtureSide];
  readonly contingency?: 'required' | 'not-required' | 'pending';
}

export type QualifierEntrants = ReadonlyMap<string, ReadonlyMap<number, string>>;

/**
 * One recorded outcome, named by its node and its match number within the node. The engine owns
 * how that maps onto its own match ids; `outcome.matchId` stays the stored match's UUID.
 */
export interface PersistedNodeOutcome {
  readonly nodeKey: string;
  readonly matchNumber: number;
  readonly outcome: RecordedOutcome;
}

export interface ZoneResolutionInput {
  readonly nodes: readonly PersistedFixtureNode[];
  readonly outcomes: readonly PersistedNodeOutcome[];
  /** The series declaration governing the zone's fixtures, when it declares one. */
  readonly series?: SeriesDeclaration;
  readonly qualifierEntrants?: QualifierEntrants;
}

/** Pure graph calculation supplied by the application composition root. */
export type ZoneEntrantResolver = (
  input: ZoneResolutionInput,
) => readonly PersistedFixtureResolution[];

/** The series declaration governing one zone, as the composition root reads it. */
export type ZoneSeriesLookup = (zone: {
  readonly tournamentId: string;
  readonly stageId: string;
  readonly zoneId: string;
}) => Promise<SeriesDeclaration | undefined>;

/**
 * Whether a zone's fixtures are a persisted graph: every one of them carries a node key. A zone
 * with none, or a mix that one transactional write cannot produce, reads as legacy.
 */
export function isPersistedGraph(
  fixtures: readonly { readonly nodeKey?: string | null | undefined }[],
): boolean {
  return (
    fixtures.length > 0 &&
    fixtures.every((fixture) => fixture.nodeKey !== undefined && fixture.nodeKey !== null)
  );
}

/** A stored source: JSON text on SQLite, a parsed value on PostgreSQL. */
export function sourceOf(raw: unknown): FixtureGraphSlotSource {
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as FixtureGraphSlotSource;
}
