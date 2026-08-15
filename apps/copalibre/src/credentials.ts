import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Lives inside the installation directory, alongside the installation
 * marker's `.copalibre/installation.json` file — corrected during
 * implementation: a single global `~/.config/copalibre/credentials.json`
 * keyed by API URL was tried first, but that conflicts with the whole reason
 * every installation's own files live in one directory in the first place —
 * a token should move/copy with the installation directory it belongs to,
 * and a leaked file should expose one installation's credential, not every
 * installation's at once. `installation.json` stays non-secret and safe to
 * commit; `credentials.json` is a separate file in the same directory, never
 * assumed safe the way `installation.json` is.
 *
 * This does mean `login`/the dual-path CLI commands need to run from inside
 * the installation directory (or `--directory <dir>`, once needed) — no
 * directory-independent case exists yet. `0087`'s Kubernetes instances (no
 * local compose directory to anchor to at all) will need their own
 * mechanism when that change lands; deliberately not solved here.
 */
export interface StoredCredential {
  readonly apiUrl: string;
  readonly token: string;
  readonly savedAt: string;
}

const MARKER_DIR = '.copalibre';
const CREDENTIALS_FILE = 'credentials.json';

function credentialsPath(cwd: string): string {
  return join(cwd, MARKER_DIR, CREDENTIALS_FILE);
}

export async function readCredential(cwd: string): Promise<StoredCredential | undefined> {
  try {
    const contents = await readFile(credentialsPath(cwd), 'utf8');
    return JSON.parse(contents) as StoredCredential;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

/**
 * Replaces any existing credential for this directory — unlike `0084`'s
 * installation marker, a token is expected to rotate (design.md), so
 * re-running `login` in the same directory is intentional, not refused.
 */
export async function writeCredential(
  cwd: string,
  apiUrl: string,
  token: string,
): Promise<StoredCredential> {
  const credential: StoredCredential = { apiUrl, token, savedAt: new Date().toISOString() };
  const path = credentialsPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(credential, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(path, 0o600);
  return credential;
}

/**
 * Duck-typed, not `error instanceof Error` — see `installation-marker.ts`'s
 * identical note: under this project's Jest `--experimental-vm-modules`
 * setup, a real `fs` error can cross a VM-realm boundary where `instanceof`
 * fails despite the error being structurally correct.
 */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}
