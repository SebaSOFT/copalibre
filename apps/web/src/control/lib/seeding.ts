/**
 * Seed assignment: locks and the constrained shuffle (0024).
 *
 * Pure functions over an array, deliberately: "did the locked seeds move?" is a
 * question that must be answerable without a browser, because the answer is the
 * whole feature. An organizer who locked the top four and pressed Randomize is
 * relying on this and nothing else.
 */

export interface SeedAssignment {
  /** 1-based. The position in the bracket, not a property of the entrant. */
  readonly seed: number;
  readonly entrantId: string;
  readonly locked: boolean;
}

export function toggleLock(
  assignments: readonly SeedAssignment[],
  seed: number,
): readonly SeedAssignment[] {
  return assignments.map((assignment) =>
    assignment.seed === seed ? { ...assignment, locked: !assignment.locked } : assignment,
  );
}

export function lockedSeeds(assignments: readonly SeedAssignment[]): readonly number[] {
  return assignments.filter((assignment) => assignment.locked).map((assignment) => assignment.seed);
}

/**
 * Reassigns the unlocked seeds among themselves.
 *
 * The locked seeds are not merely "not moved" — they are not in the pool at
 * all. Shuffling everything and then putting the locked ones back is the
 * implementation that looks equivalent and is not: it can hand a locked seed's
 * entrant to an unlocked seat, and now that entrant is in two places.
 *
 * `random` is injected so a test asserts an exact permutation rather than
 * asserting that a shuffle probably shuffled.
 */
export function randomizeUnlocked(
  assignments: readonly SeedAssignment[],
  random: () => number = Math.random,
): readonly SeedAssignment[] {
  const unlockedIndexes: number[] = [];
  const pool: string[] = [];
  assignments.forEach((assignment, index) => {
    if (assignment.locked) return;
    unlockedIndexes.push(index);
    pool.push(assignment.entrantId);
  });

  // Fisher–Yates, downwards: every permutation equally likely, which a
  // sort-by-random comparator does not give and a draw dispute would notice.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const held = pool[i] as string;
    pool[i] = pool[j] as string;
    pool[j] = held;
  }

  const shuffled = [...assignments];
  unlockedIndexes.forEach((target, position) => {
    const seat = assignments[target] as SeedAssignment;
    shuffled[target] = { ...seat, entrantId: pool[position] as string };
  });
  return shuffled;
}

/** Moves one entrant to another seat, swapping with whoever held it. */
export function swapSeeds(
  assignments: readonly SeedAssignment[],
  from: number,
  to: number,
): readonly SeedAssignment[] {
  const a = assignments.find((assignment) => assignment.seed === from);
  const b = assignments.find((assignment) => assignment.seed === to);
  if (!a || !b || a.locked || b.locked) return assignments;

  return assignments.map((assignment) => {
    if (assignment.seed === from) return { ...assignment, entrantId: b.entrantId };
    if (assignment.seed === to) return { ...assignment, entrantId: a.entrantId };
    return assignment;
  });
}

/** Whether the order differs from the one the stage was generated with. */
export function isDirty(
  assignments: readonly SeedAssignment[],
  published: readonly SeedAssignment[],
): boolean {
  if (assignments.length !== published.length) return true;
  return assignments.some(
    (assignment, index) => assignment.entrantId !== published[index]?.entrantId,
  );
}
