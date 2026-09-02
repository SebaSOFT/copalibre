import type {
  DisciplineDescriptor,
  RecordedOutcome,
  SeriesDeclaration,
  SeriesAccountingGrain,
} from '@copalibre/domain';
import { resolveAdvancement } from '../advancement/index.js';
import { InvalidEntrantsError } from '../errors.js';
import {
  computeAccounting,
  DEFAULT_POINTS,
  type PointsRules,
  type Standings,
  type StandingsRow,
} from '../standings/index.js';
import type { GeneratedMatch, SeededEntrant, SlotSource } from '../types.js';

export interface GauntletStandingRank {
  readonly rank: number;
  readonly entrantId: string;
  readonly eliminatedInRound?: number;
  readonly matchId: string;
  readonly isChampion?: boolean;
}

export interface GauntletStandingsResult {
  readonly ranks: readonly GauntletStandingRank[];
  readonly championId?: string;
  readonly runnerUpId?: string;
  readonly fullyResolved: boolean;
}

/**
 * Generates a linear Gauntlet (Stepladder) fixture tree for N seeded entrants.
 *
 * For N entrants:
 * - Total rounds: N - 1
 * - Round 1 (M1): Seed N vs Seed N - 1
 * - Round 2 (M2): Winner(M1) vs Seed N - 2
 * - ...
 * - Round N - 1 (M{N-1} - Grand Final): Winner(M{N-2}) vs Seed 1
 */
export function generateGauntlet(
  entrants: readonly SeededEntrant[],
  options?: {
    readonly idPrefix?: string;
    readonly series?: SeriesDeclaration;
  },
): readonly GeneratedMatch[] {
  if (entrants.length < 2) {
    throw new InvalidEntrantsError('A gauntlet requires at least 2 entrants', {
      entrantCount: entrants.length,
    });
  }

  if (entrants.length > 32) {
    throw new InvalidEntrantsError('A gauntlet supports at most 32 entrants', {
      entrantCount: entrants.length,
    });
  }

  const sorted = [...entrants].sort((a, b) => a.seed - b.seed);
  const n = sorted.length;
  const prefix = options?.idPrefix ?? 'GNT';
  const series = options?.series;
  const span = series?.span ?? 1;

  const matches: GeneratedMatch[] = [];

  const addDuel = (baseId: string, round: number, slotA: SlotSource, slotB: SlotSource): void => {
    if (span > 1) {
      for (let m = 1; m <= span; m++) {
        const homeSlot: 'A' | 'B' | undefined = series?.neutralGround
          ? undefined
          : m % 2 === 1
            ? 'A'
            : 'B';
        matches.push({
          id: `${baseId}-${m}`,
          shape: 'duel',
          bracket: 'winners',
          round,
          position: 1,
          slotA,
          slotB,
          matchNumber: m,
          ...(homeSlot ? { homeSlot } : {}),
          series,
        });
      }
    } else {
      matches.push({
        id: baseId,
        shape: 'duel',
        bracket: 'winners',
        round,
        position: 1,
        slotA,
        slotB,
        ...(series ? { series } : {}),
      });
    }
  };

  // Round 1: Seed N vs Seed N - 1
  const eN = sorted[n - 1];
  const eNminus1 = sorted[n - 2];
  if (eN && eNminus1) {
    addDuel(
      `${prefix}-R1-M1`,
      1,
      { kind: 'entrant', entrantId: eN.entrantId, seed: eN.seed },
      { kind: 'entrant', entrantId: eNminus1.entrantId, seed: eNminus1.seed },
    );
  }

  // Rounds 2 to N - 1: Winner of previous match vs Seed N - r
  for (let r = 2; r <= n - 1; r++) {
    const targetEntrant = sorted[n - r - 1];
    if (targetEntrant) {
      addDuel(
        `${prefix}-R${r}-M1`,
        r,
        { kind: 'winner-of', matchId: `${prefix}-R${r - 1}-M1` },
        { kind: 'entrant', entrantId: targetEntrant.entrantId, seed: targetEntrant.seed },
      );
    }
  }

  return matches;
}

/**
 * Projects Gauntlet standings based on elimination order and final champion resolution.
 */
export function projectGauntletStandings(
  entrants: readonly SeededEntrant[],
  matches: readonly GeneratedMatch[],
  outcomes: readonly RecordedOutcome[],
  prefix = 'GNT',
): GauntletStandingsResult {
  const n = entrants.length;
  const totalRounds = n - 1;

  const resolved = resolveAdvancement(
    {
      format: 'gauntlet',
      entrantCount: entrants.length,
      matches,
      rounds: [],
    },
    outcomes,
  );

  const resolvedById = new Map(resolved.map((r) => [r.matchId, r]));
  const ranks: GauntletStandingRank[] = [];

  let championId: string | undefined;
  let runnerUpId: string | undefined;

  const sorted = [...entrants].sort((a, b) => a.seed - b.seed);
  let currentAdvancingId: string | undefined = sorted[n - 1]?.entrantId;

  for (let r = 1; r <= totalRounds; r++) {
    const matchId = `${prefix}-R${r}-M1`;
    const singleMatch = resolvedById.get(matchId);

    const side1 = r === 1 ? sorted[n - 1]?.entrantId : currentAdvancingId;
    const side2 = r === 1 ? sorted[n - 2]?.entrantId : sorted[n - r - 1]?.entrantId;

    let winner: string | undefined;
    let loser: string | undefined;

    if (singleMatch?.winnerEntrantId) {
      winner = singleMatch.winnerEntrantId;
      const entrantA =
        singleMatch.slotA.state === 'entrant' ? singleMatch.slotA.entrantId : undefined;
      const entrantB =
        singleMatch.slotB.state === 'entrant' ? singleMatch.slotB.entrantId : undefined;
      loser = entrantA === winner ? entrantB : entrantA;
    } else if (r < totalRounds) {
      const nextMatchId = `${prefix}-R${r + 1}-M1`;
      const nextMatch = resolved.find(
        (m) => m.matchId === nextMatchId || m.matchId.startsWith(`${nextMatchId}-`),
      );
      if (nextMatch && nextMatch.slotA.state === 'entrant') {
        winner = nextMatch.slotA.entrantId;
        loser = winner === side1 ? side2 : side1;
      }
    } else if (side1 && side2) {
      // Final round multi-match series resolution
      const seriesMatches = resolved.filter((m) => m.matchId.startsWith(`${matchId}-`));
      let wins1 = 0;
      let wins2 = 0;
      for (const sm of seriesMatches) {
        if (sm.winnerEntrantId === side1) wins1++;
        if (sm.winnerEntrantId === side2) wins2++;
      }
      const needed = Math.floor(seriesMatches.length / 2) + 1;
      if (wins1 >= needed) {
        winner = side1;
        loser = side2;
      } else if (wins2 >= needed) {
        winner = side2;
        loser = side1;
      }
    }

    if (winner) {
      currentAdvancingId = winner;
      if (r === totalRounds) {
        championId = winner;
        runnerUpId = loser;
        ranks.push({
          rank: 1,
          entrantId: winner,
          matchId,
          isChampion: true,
        });
        if (loser) {
          ranks.push({
            rank: 2,
            entrantId: loser,
            eliminatedInRound: r,
            matchId,
          });
        }
      } else if (loser) {
        const rank = n - r + 1;
        ranks.push({
          rank,
          entrantId: loser,
          eliminatedInRound: r,
          matchId,
        });
      }
    } else {
      break;
    }
  }

  ranks.sort((a, b) => a.rank - b.rank);

  return {
    ranks,
    championId,
    runnerUpId,
    fullyResolved: ranks.length === n,
  };
}

/**
 * Computes full Standings with accounting figures and Gauntlet placement ranks.
 */
export function computeGauntletStandings(
  descriptor: DisciplineDescriptor,
  entrants: readonly SeededEntrant[],
  matches: readonly GeneratedMatch[],
  outcomes: readonly RecordedOutcome[],
  points: PointsRules = DEFAULT_POINTS,
  options?: {
    readonly seriesDeclaration?: SeriesDeclaration;
    readonly prefix?: string;
  },
): Standings {
  const entrantIds = entrants.map((e) => e.entrantId);
  const accounting = computeAccounting(descriptor, entrantIds, outcomes, points, options);
  const byId = new Map(accounting.map((row) => [row.entrantId, row]));

  const result = projectGauntletStandings(entrants, matches, outcomes, options?.prefix);
  const rankByEntrant = new Map(result.ranks.map((r) => [r.entrantId, r.rank]));

  // Sort entrants: contenders still in tournament first (by seed), eliminated entrants last (by rank)
  const sortedEntrants = [...entrants].sort((a, b) => {
    const rankA = rankByEntrant.get(a.entrantId);
    const rankB = rankByEntrant.get(b.entrantId);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA === undefined && rankB !== undefined) return -1;
    if (rankA !== undefined && rankB === undefined) return 1;
    return a.seed - b.seed;
  });

  const rows: StandingsRow[] = [];
  let nextRank = 1;

  for (const entrant of sortedEntrants) {
    const row = byId.get(entrant.entrantId);
    if (!row) continue;
    const resolvedRank = rankByEntrant.get(entrant.entrantId);
    const assignedRank = resolvedRank ?? nextRank;
    rows.push({
      ...row,
      rank: assignedRank,
      sharedRank: false,
    });
    nextRank++;
  }

  const grain: SeriesAccountingGrain =
    options?.seriesDeclaration?.standingsAccounting === 'series' ? 'series' : 'match';

  return {
    rows,
    trace: [],
    fullyResolved: result.fullyResolved,
    grain,
  };
}
