import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

export interface EnvFileUpdate {
  /** The keys whose value changed, in the order given; never their values. */
  readonly changed: readonly string[];
  /** The copy of the previous file, written before it changed; absent when nothing changed. */
  readonly backup?: string;
}

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/**
 * Sets `updates` in an `.env` file by key: an existing assignment is replaced in place, a new key is
 * appended, and every comment, blank line, order and other key is kept. The previous file is copied
 * first to `<path>.<timestamp>.bak`, and both files are readable by their owner only.
 */
export async function updateEnvFile(
  path: string,
  updates: Readonly<Record<string, string>>,
  now: Date = new Date(),
): Promise<EnvFileUpdate> {
  const previous = await readFile(path, 'utf8');
  const current = parseEnv(previous) as Record<string, string | undefined>;
  const changed = Object.keys(updates).filter((key) => current[key] !== updates[key]);
  if (changed.length === 0) return { changed };

  const lines = previous.split('\n');
  const assignments = new Map(
    changed.map((key) => [key, `${key}=${envValue(updates[key] ?? '')}`] as const),
  );
  const pending = new Set(changed);
  const rewritten = lines.map((line) => {
    const key = ASSIGNMENT.exec(line)?.[1];
    if (key === undefined || !pending.has(key)) return line;
    pending.delete(key);
    return assignments.get(key) ?? line;
  });
  // Every later assignment of a key wins when the file is read; the first one now holds the value,
  // so the others are dropped.
  const seen = new Set<string>();
  const kept = rewritten.filter((line) => {
    const key = ASSIGNMENT.exec(line)?.[1];
    if (key === undefined || !changed.includes(key)) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (kept.length > 0 && kept.at(-1) === '') kept.pop();
  for (const [key, assignment] of assignments) if (pending.has(key)) kept.push(assignment);

  const backup = `${path}.${now.toISOString().replaceAll(':', '-').replace('.', '-')}.bak`;
  await writeFile(backup, previous, { mode: 0o600, flag: 'wx' });
  await chmod(backup, 0o600);
  const staged = `${path}.next`;
  await writeFile(staged, `${kept.join('\n')}\n`, { mode: 0o600 });
  await chmod(staged, 0o600);
  await rename(staged, path);
  return { changed, backup };
}

/**
 * Plain when Compose and Node read the value back unchanged; single-quoted otherwise, which both
 * take literally (no `$` interpolation, no escapes); double-quoted when it holds a single quote and
 * nothing either reader would change. Anything else cannot be written so that both agree.
 */
export function envValue(value: string): string {
  if (/^[A-Za-z0-9_@.:/+\-,%~=?&]*$/.test(value)) return value;
  if (!/['\n\r]/.test(value)) return `'${value}'`;
  if (!/["$\\\n\r]/.test(value)) return `"${value}"`;
  throw new Error(
    'This value cannot be stored in .env: it mixes quotes with $, \\ or a line break',
  );
}
