import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Golden-fixture harness: deterministic evaluations (facts + rule version →
 * output + trace) are compared against committed JSON snapshots. The generator's
 * format-specific standings tests reuse this harness.
 *
 * Update fixtures intentionally with: UPDATE_GOLDEN=1 yarn workspace
 * @copalibre/rules test
 */
const FIXTURES_DIR = join(import.meta.dirname, '..', '__fixtures__');

export function expectGolden(name: string, actual: unknown): void {
  // Round-trip first: golden fixtures are also the serializability proof.
  const serialized = JSON.parse(JSON.stringify(actual)) as unknown;
  const file = join(FIXTURES_DIR, `${name}.json`);

  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(file)) {
    writeFileSync(file, `${JSON.stringify(serialized, null, 2)}\n`);
    if (process.env.UPDATE_GOLDEN !== '1') {
      throw new Error(
        `Golden fixture "${name}" did not exist and was created; re-run the suite to compare against it`,
      );
    }
    return;
  }

  const expected = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  expect(serialized).toEqual(expected);
}
