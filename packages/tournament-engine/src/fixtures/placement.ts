import type { DrawConstraint, EntrantAttribute, PlacementFormat } from '@copalibre/domain';
import { runDraw } from '../draw/index.js';
import { InvalidEntrantsError } from '../errors.js';
import type { PlacementMatch, SeededEntrant, SlotSource } from '../types.js';

/**
 * Placement stages: rounds of matches that produce an ordering, not a winner.
 *
 * `free-for-all` puts every entrant on one table each round — a small esports
 * final, a single-heat race, a battle-royale decider. `heats` divides them into
 * parallel lobbies — swimming heats, battle-royale group phases.
 *
 * They are separate formats rather than one parameterised format because heats
 * need allocation and rotation and free-for-all needs neither; collapsing them
 * would make "how many lobbies" a question with a meaningless answer half the
 * time.
 *
 * Neither routes into another match. The stage table is the hand-off, which is
 * why the advancement engine is untouched by this format and why an FFA stage
 * renders as a leaderboard rather than a bracket.
 */

export interface PlacementOptions {
  /** Rounds played. Every entrant appears exactly once in each. */
  readonly rounds?: number;
  /** `heats` only: entrants per lobby. Sizes are balanced, not padded. */
  readonly lobbySize?: number;
  /** Seed for the per-round allocation; recorded so a draw replays. */
  readonly drawSeed?: number;
  readonly constraints?: readonly DrawConstraint[];
  readonly attributes?: ReadonlyMap<string, readonly EntrantAttribute[]>;
}

const DEFAULT_ROUNDS = 1;
const DEFAULT_SEED = 1;

export function buildPlacementStage(
  format: PlacementFormat,
  entrants: readonly SeededEntrant[],
  options: PlacementOptions = {},
): readonly PlacementMatch[] {
  const rounds = options.rounds ?? DEFAULT_ROUNDS;
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new InvalidEntrantsError(`A placement stage needs at least one round, not ${rounds}`, {
      rounds,
    });
  }

  return format === 'free-for-all'
    ? freeForAll(entrants, rounds)
    : heats(entrants, rounds, options);
}

/** Every entrant, every round, one table. */
function freeForAll(entrants: readonly SeededEntrant[], rounds: number): readonly PlacementMatch[] {
  return Array.from({ length: rounds }, (_unused, index) => ({
    id: `FFA-R${index + 1}-M1`,
    shape: 'placement' as const,
    bracket: 'placement' as const,
    round: index + 1,
    position: 1,
    slots: entrants.map(slotFor),
  }));
}

/**
 * Parallel lobbies, re-drawn every round.
 *
 * Rotation is part of the format rather than an operator's chore: four rounds
 * that put the same sixteen players in the same four lobbies measure the lobby,
 * not the player. Each round is a fresh constrained draw whose seed derives
 * from the stage seed and the round number, so the whole stage still replays
 * from one recorded number.
 */
function heats(
  entrants: readonly SeededEntrant[],
  rounds: number,
  options: PlacementOptions,
): readonly PlacementMatch[] {
  const lobbySize = options.lobbySize ?? entrants.length;
  if (!Number.isInteger(lobbySize) || lobbySize < 2) {
    throw new InvalidEntrantsError(`A heat needs at least two entrants, not ${lobbySize}`, {
      lobbySize,
    });
  }

  const lobbyCount = Math.ceil(entrants.length / lobbySize);
  const stageSeed = options.drawSeed ?? DEFAULT_SEED;
  const matches: PlacementMatch[] = [];

  for (let round = 1; round <= rounds; round += 1) {
    const drawn = runDraw({
      entrants: entrants.map((entrant) => ({
        entrantId: entrant.entrantId,
        attributes: options.attributes?.get(entrant.entrantId) ?? [],
      })),
      constraints: options.constraints ?? [],
      shape: { kind: 'groups', count: lobbyCount },
      seed: roundSeed(stageSeed, round),
    });

    const byLobby = new Map<number, SeededEntrant[]>();
    for (const [entrantId, lobby] of Object.entries(drawn.assignment.groups ?? {})) {
      const seeded = entrants.find((entrant) => entrant.entrantId === entrantId);
      if (!seeded) continue;
      byLobby.set(lobby, [...(byLobby.get(lobby) ?? []), seeded]);
    }

    for (const [lobby, members] of [...byLobby].sort(([a], [b]) => a - b)) {
      matches.push({
        id: `HT-R${round}-M${lobby}`,
        shape: 'placement',
        bracket: 'placement',
        round,
        position: lobby,
        // Ordered by seed so a lobby's line-up reads the same on every replay,
        // whatever order the draw happened to place them in.
        slots: [...members].sort((a, b) => a.seed - b.seed).map(slotFor),
      });
    }
  }

  return matches;
}

/**
 * One recorded stage seed yields every round's draw. Multiplying before adding
 * keeps consecutive stages from sharing a round's stream — stage 7 round 2 and
 * stage 8 round 1 would otherwise draw identically.
 */
export function roundSeed(stageSeed: number, round: number): number {
  return stageSeed * 1_000 + round;
}

function slotFor(entrant: SeededEntrant): SlotSource {
  return { kind: 'entrant', entrantId: entrant.entrantId, seed: entrant.seed };
}
