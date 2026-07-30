import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Golden-fixture harness, same contract as `packages/rules`: committed JSON is
 * the expected output. Update intentionally with
 *   UPDATE_GOLDEN=1 yarn workspace @copalibre/tournament-engine test
 */
const FIXTURES_DIR = join(import.meta.dirname, '..', '__fixtures__');

export function expectGolden(name: string, actual: unknown): void {
  const serialized = JSON.parse(JSON.stringify(actual)) as unknown;
  const file = join(FIXTURES_DIR, `${name}.json`);

  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(file)) {
    writeFileSync(file, `${JSON.stringify(serialized, null, 2)}\n`);
    if (process.env.UPDATE_GOLDEN !== '1') {
      throw new Error(
        `Golden fixture "${name}" was missing and has been created; re-run to compare`,
      );
    }
    return;
  }
  expect(serialized).toEqual(JSON.parse(readFileSync(file, 'utf8')));
}

/** Compact, diff-friendly view of a fixture graph. */
export function summarise(
  matches: readonly {
    id: string;
    bracket: string;
    round: number;
    slotA: unknown;
    slotB: unknown;
    conditional?: string;
  }[],
): readonly string[] {
  const show = (slot: unknown): string => {
    const s = slot as { kind: string; entrantId?: string; matchId?: string };
    if (s.kind === 'entrant') return s.entrantId ?? '?';
    if (s.kind === 'bye') return 'BYE';
    return `${s.kind === 'winner-of' ? 'W' : 'L'}(${s.matchId})`;
  };
  return matches.map(
    (m) =>
      `${m.id} ${show(m.slotA)} vs ${show(m.slotB)}${m.conditional ? ` [${m.conditional}]` : ''}`,
  );
}
