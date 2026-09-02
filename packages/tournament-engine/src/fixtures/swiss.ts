import type { RecordedOutcome, SeriesDeclaration } from '@copalibre/domain';
import { InvalidEntrantsError } from '../errors.js';
import { isDuelMatch, type GeneratedMatch, type SeededEntrant, type SlotSource } from '../types.js';

export interface GenerateNextSwissRoundInput {
  readonly round: number;
  readonly entrants: readonly SeededEntrant[];
  readonly previousMatches: readonly GeneratedMatch[];
  readonly outcomes: readonly RecordedOutcome[];
  readonly options?: {
    readonly idPrefix?: string;
    readonly series?: SeriesDeclaration;
  };
}

interface SwissPlayer {
  readonly entrant: SeededEntrant;
  readonly score: number;
  readonly buchholz: number;
}

function appendSwissMatch(
  matches: GeneratedMatch[],
  baseId: string,
  round: number,
  position: number,
  slotA: SlotSource,
  slotB: SlotSource,
  series?: SeriesDeclaration,
): void {
  const span = series?.span ?? 1;
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
        position,
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
      position,
      slotA,
      slotB,
      ...(series ? { series } : {}),
    });
  }
}

/**
 * Generates Round 1 fixtures for a Swiss tournament.
 * Splits seeded entrants into top half and bottom half (1 vs N/2+1, 2 vs N/2+2, etc.).
 * If entrant count is odd, the lowest seed receives a bye.
 */
export function generateSwissRound1(
  entrants: readonly SeededEntrant[],
  options?: {
    readonly idPrefix?: string;
    readonly series?: SeriesDeclaration;
  },
): readonly GeneratedMatch[] {
  if (entrants.length < 2) {
    throw new InvalidEntrantsError('A Swiss tournament requires at least 2 entrants', {
      entrantCount: entrants.length,
    });
  }

  const sorted = [...entrants].sort((a, b) => a.seed - b.seed);
  const n = sorted.length;
  const prefix = options?.idPrefix ?? 'SWISS';
  const series = options?.series;

  let byeEntrant: SeededEntrant | undefined;
  let active = sorted;

  if (n % 2 === 1) {
    byeEntrant = sorted[n - 1];
    active = sorted.slice(0, n - 1);
  }

  const k = active.length / 2;
  const top = active.slice(0, k);
  const bottom = active.slice(k);

  const matches: GeneratedMatch[] = [];

  for (let i = 0; i < k; i++) {
    const t = top[i];
    const b = bottom[i];
    if (t && b) {
      appendSwissMatch(
        matches,
        `${prefix}-R1-M${i + 1}`,
        1,
        i + 1,
        { kind: 'entrant', entrantId: t.entrantId, seed: t.seed },
        { kind: 'entrant', entrantId: b.entrantId, seed: b.seed },
        series,
      );
    }
  }

  if (byeEntrant) {
    appendSwissMatch(
      matches,
      `${prefix}-R1-M${k + 1}`,
      1,
      k + 1,
      { kind: 'entrant', entrantId: byeEntrant.entrantId, seed: byeEntrant.seed },
      { kind: 'bye' },
      series,
    );
  }

  return matches;
}

/**
 * Normalizes two entrant IDs into a deterministic pair key.
 */
function pairKey(idA: string, idB: string): string {
  return [idA, idB].sort().join(':');
}

/**
 * Generates next Swiss round fixtures dynamically based on previous round outcomes.
 * Implements Dutch Swiss pairing with score-grouping, rematch avoidance, floaters, and byes.
 */
export function generateNextSwissRoundFixtures(
  input: GenerateNextSwissRoundInput,
): readonly GeneratedMatch[] {
  const { round, entrants, previousMatches, outcomes, options } = input;
  const prefix = options?.idPrefix ?? 'SWISS';
  const series = options?.series;

  // 1. History extraction: Rematches and prior byes
  const playedPairs = new Set<string>();
  const hadBye = new Set<string>();

  for (const m of previousMatches) {
    if (isDuelMatch(m)) {
      if (m.slotA.kind === 'entrant' && m.slotB.kind === 'entrant') {
        playedPairs.add(pairKey(m.slotA.entrantId, m.slotB.entrantId));
      } else if (m.slotA.kind === 'entrant' && m.slotB.kind === 'bye') {
        hadBye.add(m.slotA.entrantId);
      }
    }
  }

  // 2. Score calculation
  const scores = new Map<string, number>();
  for (const e of entrants) {
    scores.set(e.entrantId, 0);
  }

  for (const out of outcomes) {
    if (out.winnerEntrantId) {
      scores.set(out.winnerEntrantId, (scores.get(out.winnerEntrantId) ?? 0) + 1);
    } else if (out.sides.length === 2) {
      // Draw: 0.5 pts each
      const id1 = out.sides[0]?.entrantId;
      const id2 = out.sides[1]?.entrantId;
      if (id1) scores.set(id1, (scores.get(id1) ?? 0) + 0.5);
      if (id2) scores.set(id2, (scores.get(id2) ?? 0) + 0.5);
    }
  }

  // Count bye walkovers if not in outcomes
  for (const m of previousMatches) {
    if (isDuelMatch(m) && m.slotA.kind === 'entrant' && m.slotB.kind === 'bye') {
      const entrantId = m.slotA.entrantId;
      const alreadyHasOutcome = outcomes.some(
        (o) => o.matchId === m.id && o.winnerEntrantId === entrantId,
      );
      if (!alreadyHasOutcome) {
        scores.set(entrantId, (scores.get(entrantId) ?? 0) + 1);
      }
    }
  }

  // Opponent scores for Buchholz tiebreaking
  const buchholz = new Map<string, number>();
  for (const e of entrants) {
    let sum = 0;
    for (const m of previousMatches) {
      if (isDuelMatch(m) && m.slotA.kind === 'entrant' && m.slotB.kind === 'entrant') {
        if (m.slotA.entrantId === e.entrantId) {
          sum += scores.get(m.slotB.entrantId) ?? 0;
        } else if (m.slotB.entrantId === e.entrantId) {
          sum += scores.get(m.slotA.entrantId) ?? 0;
        }
      }
    }
    buchholz.set(e.entrantId, sum);
  }

  // 3. Bye allocation for odd number of entrants
  let byeEntrant: SeededEntrant | undefined;
  let activeEntrants = [...entrants];

  if (entrants.length % 2 === 1) {
    const eligibleForBye = entrants.filter((e) => !hadBye.has(e.entrantId));
    const pool = eligibleForBye.length > 0 ? eligibleForBye : [...entrants];

    pool.sort((a, b) => {
      const scoreDiff = (scores.get(a.entrantId) ?? 0) - (scores.get(b.entrantId) ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return b.seed - a.seed; // lowest seed (highest number) first
    });

    byeEntrant = pool[0];
    if (byeEntrant) {
      activeEntrants = entrants.filter((e) => e.entrantId !== byeEntrant?.entrantId);
    }
  }

  // 4. Dutch Swiss pairing algorithm
  const players: SwissPlayer[] = activeEntrants.map((entrant) => ({
    entrant,
    score: scores.get(entrant.entrantId) ?? 0,
    buchholz: buchholz.get(entrant.entrantId) ?? 0,
  }));

  // Sort players: score desc, buchholz desc, seed asc
  players.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    return a.entrant.seed - b.entrant.seed;
  });

  const pairList = solveSwissPairings(players, playedPairs);
  if (!pairList) {
    throw new Error(`Failed to find a valid Swiss pairing for round ${round} without rematches`);
  }

  const matches: GeneratedMatch[] = [];

  let pos = 1;
  for (const [p1, p2] of pairList) {
    appendSwissMatch(
      matches,
      `${prefix}-R${round}-M${pos}`,
      round,
      pos,
      { kind: 'entrant', entrantId: p1.entrant.entrantId, seed: p1.entrant.seed },
      { kind: 'entrant', entrantId: p2.entrant.entrantId, seed: p2.entrant.seed },
      series,
    );
    pos++;
  }

  if (byeEntrant) {
    appendSwissMatch(
      matches,
      `${prefix}-R${round}-M${pos}`,
      round,
      pos,
      { kind: 'entrant', entrantId: byeEntrant.entrantId, seed: byeEntrant.seed },
      { kind: 'bye' },
      series,
    );
  }

  return matches;
}

/**
 * Backtracking search to find an optimal Dutch Swiss matching without rematches.
 */
function solveSwissPairings(
  remaining: readonly SwissPlayer[],
  playedPairs: ReadonlySet<string>,
): [SwissPlayer, SwissPlayer][] | null {
  if (remaining.length === 0) return [];
  if (remaining.length < 2) return null;

  const first = remaining[0];
  if (!first) return null;

  // Candidates: all other remaining players who haven't played `first`
  const rest = remaining.slice(1);
  const eligible = rest.filter(
    (p) => !playedPairs.has(pairKey(first.entrant.entrantId, p.entrant.entrantId)),
  );

  const sameScorePlayers = [first, ...rest.filter((p) => p.score === first.score)];
  const half = Math.ceil(sameScorePlayers.length / 2);
  const targetOpponent = sameScorePlayers[half];

  eligible.sort((a, b) => {
    const distA = Math.abs(first.score - a.score);
    const distB = Math.abs(first.score - b.score);
    if (distA !== distB) return distA - distB;

    // In same score group, prioritize the half-split target
    if (targetOpponent) {
      if (a === targetOpponent) return -1;
      if (b === targetOpponent) return 1;
    }

    return a.entrant.seed - b.entrant.seed;
  });

  for (const opponent of eligible) {
    const nextRemaining = rest.filter((p) => p !== opponent);
    const subResult = solveSwissPairings(nextRemaining, playedPairs);
    if (subResult !== null) {
      return [[first, opponent], ...subResult];
    }
  }

  return null;
}
