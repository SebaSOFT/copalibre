import type { FixtureResponse, FixtureSeriesResponse } from './api-client.js';

/**
 * Turning a stage's fixtures into the rows a schedule builder places.
 *
 * The placeable thing is a match, never a cross. A single-match fixture yields exactly one row
 * and reads as it always has; a best-of-five yields five, numbered in play order, each with its
 * own slot and its own officials — because game one and game four can legitimately sit at
 * different venues on different days.
 *
 * Grouping is not decoration. Five rows between the same two entrants read as five unrelated
 * matches unless they are shown under the cross they settle, and an organizer placing game four
 * needs to know it is game four.
 */

/**
 * Whether a game will certainly be played, might not be, or now will not be.
 *
 * Stated in words wherever it is rendered rather than by color: "this match may never happen"
 * is not a state an operator can guess from a shade, and the platform's non-color-redundancy
 * rule applies here with more force than usual.
 */
export type SeriesContingency = 'certain' | 'contingent' | 'no-longer-required';

export interface BuilderRow {
  readonly fixtureId: string;
  readonly matchId: string;
  /** 1-based play order within the fixture. Always 1 for a single-match fixture. */
  readonly number: number;
  readonly status: 'scheduled' | 'in-progress' | 'finalized' | 'not-required';
  /** Absent on a fixture declaring no series — there is nothing contingent about a single match. */
  readonly contingency?: SeriesContingency;
  /**
   * True when the series has decided this game away but the anulling has not been committed:
   * the row still holds its slot, and that slot is about to be freed.
   */
  readonly releasePending: boolean;
  /** The slot this game had occupied before a committed anulling freed it. */
  readonly releasedSlotId?: string;
}

export interface BuilderGroup {
  readonly fixtureId: string;
  readonly round: number;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
  /** Absent on a single match; present on every row of a series so the cross can be labelled. */
  readonly series?: FixtureSeriesResponse;
  readonly rows: readonly BuilderRow[];
}

/**
 * Groups a stage's fixtures into one group per cross, each holding its rows in play order.
 *
 * Tolerates a fixture with no `matches` array at all — an older response, or a stage read
 * before this change shipped — by falling back to the fixture's own `matchId` as a single
 * scheduled row. A builder that rendered nothing for such a fixture would be strictly worse
 * than the one that existed before.
 */
export function builderGroups(fixtures: readonly FixtureResponse[]): readonly BuilderGroup[] {
  return fixtures.map((fixture) => {
    const matches =
      fixture.matches !== undefined && fixture.matches.length > 0
        ? [...fixture.matches].sort((a, b) => a.number - b.number)
        : [{ matchId: fixture.matchId, number: 1, status: 'scheduled' as const }];

    return {
      fixtureId: fixture.fixtureId,
      round: fixture.round,
      ...(fixture.homeEntrantId === undefined ? {} : { homeEntrantId: fixture.homeEntrantId }),
      ...(fixture.awayEntrantId === undefined ? {} : { awayEntrantId: fixture.awayEntrantId }),
      ...(fixture.series === undefined ? {} : { series: fixture.series }),
      rows: matches.map((match) => {
        const anulled = fixture.series?.anulledMatchNumbers.includes(match.number) ?? false;
        const releasePending = anulled && match.status === 'scheduled';
        return {
          fixtureId: fixture.fixtureId,
          matchId: match.matchId,
          number: match.number,
          status: match.status,
          ...(fixture.series === undefined
            ? {}
            : { contingency: contingencyOf(fixture.series, match.number, match.status) }),
          releasePending,
          ...(match.releasedSlotId === undefined ? {} : { releasedSlotId: match.releasedSlotId }),
        };
      }),
    };
  });
}

/**
 * A game already anulled, or decided away and awaiting the anulling, is no longer required
 * whatever its position. Otherwise position decides: a best-of-five cannot end before its third
 * game, so games one to three are certain and four and five happen only if the series is still
 * alive. Every other class plays its full span — an aggregate tie's second leg is played
 * whatever the first leg did — so `guaranteedMatches` covers all of it and nothing is contingent.
 */
function contingencyOf(
  series: FixtureSeriesResponse,
  number: number,
  status: string,
): SeriesContingency {
  if (status === 'not-required') return 'no-longer-required';
  if (series.anulledMatchNumbers.includes(number)) return 'no-longer-required';
  return number <= series.guaranteedMatches ? 'certain' : 'contingent';
}

export interface PendingRelease {
  readonly matchId: string;
  readonly fixtureId: string;
  readonly number: number;
  readonly slotId: string;
}

/**
 * The slots a series decision would free, before the removal is committed.
 *
 * An organizer who has just seen a best-of-five decide in three needs to know that Court 2 at
 * 19:00 and Court 1 at 21:00 are about to come back — those are two hours of venue that can be
 * given to someone else, and finding out after the fact is finding out too late.
 *
 * `assignedSlotOf` reports where a row currently sits, which is the builder's own draft state:
 * a row whose slot the operator has not yet chosen frees nothing.
 */
export function pendingReleases(
  groups: readonly BuilderGroup[],
  assignedSlotOf: (matchId: string) => string | undefined,
): readonly PendingRelease[] {
  const releases: PendingRelease[] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      if (!row.releasePending) continue;
      const slotId = assignedSlotOf(row.matchId);
      if (slotId === undefined || slotId === '') continue;
      releases.push({
        matchId: row.matchId,
        fixtureId: row.fixtureId,
        number: row.number,
        slotId,
      });
    }
  }
  return releases;
}
