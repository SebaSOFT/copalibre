import type { RecordedOutcome, SeriesDeclaration } from '@copalibre/domain';
import { resolveAdvancement } from '../advancement/index.js';
import { InvalidEntrantsError } from '../errors.js';
import type { BracketGroupsOptions, GeneratedMatch, SeededEntrant, SlotSource } from '../types.js';

export interface BracketGroupQualification {
  readonly groupId: string;
  readonly groupNumber: number;
  /** 1st place in group: winner of Winners' Match (R2-M1) */
  readonly winnerId?: string;
  /** 2nd place in group: winner of Decider Match (R3-M1) */
  readonly runnerUpId?: string;
  /** 3rd place in group: loser of Decider Match (R3-M1) */
  readonly thirdPlaceId?: string;
  /** 4th place in group: loser of Elimination Match (R2-M2) */
  readonly fourthPlaceId?: string;
  /** Top 2 qualified entrants: [winnerId, runnerUpId] when resolved */
  readonly qualified: readonly string[];
  /** 3rd and 4th place eliminated entrants */
  readonly eliminated: readonly string[];
  readonly fullyResolved: boolean;
}

/**
 * Generates GSL dual-tournament mini-brackets for groups of 4 entrants.
 *
 * Each group generates exactly 5 matches:
 * - Round 1, Match 1 (Opening A): Seed #1 vs Seed #4
 * - Round 1, Match 2 (Opening B): Seed #2 vs Seed #3
 * - Round 2, Match 1 (Winners): Winner M1 vs Winner M2 -> Winner qualifies as #1
 * - Round 2, Match 2 (Elimination): Loser M1 vs Loser M2 -> Loser is eliminated as #4
 * - Round 3, Match 1 (Decider): Loser R2-M1 vs Winner R2-M2 -> Winner qualifies as #2, Loser eliminated as #3
 */
export function generateBracketGroups(
  entrants: readonly SeededEntrant[],
  options?: {
    readonly idPrefix?: string;
    readonly bracketGroups?: BracketGroupsOptions;
    readonly series?: SeriesDeclaration;
  },
): readonly GeneratedMatch[] {
  const groupSize = options?.bracketGroups?.groupSize ?? 4;
  if (groupSize !== 4) {
    throw new InvalidEntrantsError(
      `Bracket groups currently support group size of 4, received ${groupSize}`,
    );
  }

  if (entrants.length < groupSize) {
    throw new InvalidEntrantsError(
      `Bracket groups require at least ${groupSize} entrants, received ${entrants.length}`,
    );
  }

  if (entrants.length % groupSize !== 0) {
    throw new InvalidEntrantsError(
      `Entrant count must be a multiple of ${groupSize} for bracket groups, received ${entrants.length}`,
    );
  }

  const groupCount = entrants.length / groupSize;
  const seedingMethod = options?.bracketGroups?.seedingMethod ?? 'snake';
  const prefix = options?.idPrefix ?? options?.bracketGroups?.idPrefix ?? 'BG';
  const series = options?.series;

  const sorted = [...entrants].sort((a, b) => a.seed - b.seed);
  const groups: SeededEntrant[][] = Array.from({ length: groupCount }, () => []);

  if (seedingMethod === 'sequential') {
    for (let i = 0; i < sorted.length; i++) {
      const gIndex = Math.floor(i / groupSize);
      const entrant = sorted[i];
      if (entrant) groups[gIndex]?.push(entrant);
    }
  } else {
    // Snake seeding: 0..G-1, G-1..0, 0..G-1, G-1..0
    let currentGroup = 0;
    let direction = 1;
    for (const entrant of sorted) {
      groups[currentGroup]?.push(entrant);
      if (direction === 1) {
        if (currentGroup === groupCount - 1) {
          direction = -1;
        } else {
          currentGroup++;
        }
      } else {
        if (currentGroup === 0) {
          direction = 1;
        } else {
          currentGroup--;
        }
      }
    }
  }

  const matches: GeneratedMatch[] = [];

  for (let g = 1; g <= groupCount; g++) {
    const groupEntrants = groups[g - 1] ?? [];
    const sortedGroup = [...groupEntrants].sort((a, b) => a.seed - b.seed);
    const e1 = sortedGroup[0];
    const e2 = sortedGroup[1];
    const e3 = sortedGroup[2];
    const e4 = sortedGroup[3];

    if (!e1 || !e2 || !e3 || !e4) continue;

    const m1BaseId = `${prefix}-G${g}-R1-M1`;
    const m2BaseId = `${prefix}-G${g}-R1-M2`;
    const m3BaseId = `${prefix}-G${g}-R2-M1`;
    const m4BaseId = `${prefix}-G${g}-R2-M2`;
    const m5BaseId = `${prefix}-G${g}-R3-M1`;

    const addDuel = (
      baseId: string,
      round: number,
      position: number,
      slotA: SlotSource,
      slotB: SlotSource,
    ): void => {
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
            bracket: 'bracket-groups',
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
          bracket: 'bracket-groups',
          round,
          position,
          slotA,
          slotB,
          ...(series ? { series } : {}),
        });
      }
    };

    // Round 1: Opening Matches
    // M1: Seed 1 vs Seed 4
    addDuel(
      m1BaseId,
      1,
      1,
      { kind: 'entrant', entrantId: e1.entrantId, seed: e1.seed },
      { kind: 'entrant', entrantId: e4.entrantId, seed: e4.seed },
    );
    // M2: Seed 2 vs Seed 3
    addDuel(
      m2BaseId,
      1,
      2,
      { kind: 'entrant', entrantId: e2.entrantId, seed: e2.seed },
      { kind: 'entrant', entrantId: e3.entrantId, seed: e3.seed },
    );

    // Round 2: Winners and Elimination Matches
    // M3 (Winners): Winner M1 vs Winner M2
    addDuel(
      m3BaseId,
      2,
      1,
      { kind: 'winner-of', matchId: m1BaseId },
      { kind: 'winner-of', matchId: m2BaseId },
    );
    // M4 (Elimination): Loser M1 vs Loser M2
    addDuel(
      m4BaseId,
      2,
      2,
      { kind: 'loser-of', matchId: m1BaseId },
      { kind: 'loser-of', matchId: m2BaseId },
    );

    // Round 3: Decider Match
    // M5 (Decider): Loser Winners (M3) vs Winner Elimination (M4)
    addDuel(
      m5BaseId,
      3,
      1,
      { kind: 'loser-of', matchId: m3BaseId },
      { kind: 'winner-of', matchId: m4BaseId },
    );
  }

  return matches;
}

/**
 * Resolves bracket group positions for all groups using the fixture graph and recorded outcomes.
 */
export function resolveBracketGroupAdvancement(
  matches: readonly GeneratedMatch[],
  outcomes: readonly RecordedOutcome[],
  prefix = 'BG',
): readonly BracketGroupQualification[] {
  const groupNumbers = new Set<number>();
  for (const m of matches) {
    const match = m.id.match(new RegExp(`^${prefix}-G(\\d+)-`));
    if (match && match[1]) {
      groupNumbers.add(parseInt(match[1], 10));
    }
  }

  const resolved = resolveAdvancement(
    {
      format: 'bracket-groups',
      entrantCount: matches.length,
      matches,
      rounds: [],
    },
    outcomes,
  );

  const resolvedById = new Map(resolved.map((r) => [r.matchId, r]));

  return Array.from(groupNumbers)
    .sort((a, b) => a - b)
    .map((g) => {
      const m3Id = `${prefix}-G${g}-R2-M1`;
      const m4Id = `${prefix}-G${g}-R2-M2`;
      const m5Id = `${prefix}-G${g}-R3-M1`;

      const m3 = resolvedById.get(m3Id);
      const m4 = resolvedById.get(m4Id);
      const m5 = resolvedById.get(m5Id);

      const winnerId = m3?.winnerEntrantId;
      const runnerUpId = m5?.winnerEntrantId;

      let fourthPlaceId: string | undefined;
      if (m4?.winnerEntrantId) {
        const entrantA = m4.slotA.state === 'entrant' ? m4.slotA.entrantId : undefined;
        const entrantB = m4.slotB.state === 'entrant' ? m4.slotB.entrantId : undefined;
        fourthPlaceId = entrantA === m4.winnerEntrantId ? entrantB : entrantA;
      }

      let thirdPlaceId: string | undefined;
      if (m5?.winnerEntrantId) {
        const entrantA = m5.slotA.state === 'entrant' ? m5.slotA.entrantId : undefined;
        const entrantB = m5.slotB.state === 'entrant' ? m5.slotB.entrantId : undefined;
        thirdPlaceId = entrantA === m5.winnerEntrantId ? entrantB : entrantA;
      }

      const qualified: string[] = [];
      if (winnerId) qualified.push(winnerId);
      if (runnerUpId) qualified.push(runnerUpId);

      const eliminated: string[] = [];
      if (thirdPlaceId) eliminated.push(thirdPlaceId);
      if (fourthPlaceId) eliminated.push(fourthPlaceId);

      const fullyResolved =
        winnerId !== undefined &&
        runnerUpId !== undefined &&
        thirdPlaceId !== undefined &&
        fourthPlaceId !== undefined;

      return {
        groupId: `G${g}`,
        groupNumber: g,
        winnerId,
        runnerUpId,
        thirdPlaceId,
        fourthPlaceId,
        qualified,
        eliminated,
        fullyResolved,
      };
    });
}
