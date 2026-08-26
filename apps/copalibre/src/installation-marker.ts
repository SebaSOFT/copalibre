import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { newId } from '@copalibre/persistence';

/**
 * Records that a directory holds a `copalibre init`-created installation —
 * the same role `.git` plays for a checkout: a marker every later command
 * auto-detects from the current working directory, with no flag needed when
 * you're standing in the directory you `init`'d.
 *
 * Non-secret by construction, unlike `.env` — safe if a `.copalibre/`
 * directory is accidentally committed to version control. Credentials are
 * deliberately never stored here.
 *
 * `mode` discriminates two genuinely different installation shapes:
 * `compose` (a `docker-compose.yml`/`.env` pair `init` also wrote) and
 * `kubernetes` (a Helm `values.yaml` scaffold — no compose file, no `.env`;
 * Kubernetes' own Secret/ConfigMap mechanism stays authoritative). A
 * kubernetes-mode marker additionally records which release, namespace, and
 * (optionally) kube-context this directory represents, so later commands
 * don't need `--namespace`/`--release` repeated on every invocation — these
 * fields are advisory, never used for cluster introspection: every command
 * that reads them also accepts an explicit override.
 */
export type InstallationMarker = ComposeInstallationMarker | KubernetesInstallationMarker;

interface InstallationMarkerBase {
  readonly version: string;
  readonly installId: string;
  readonly createdAt: string;
}

export interface ComposeInstallationMarker extends InstallationMarkerBase {
  readonly mode: 'compose';
}

export interface KubernetesInstallationMarker extends InstallationMarkerBase {
  readonly mode: 'kubernetes';
  readonly release: string;
  readonly namespace: string;
  readonly context?: string;
}

export interface KubernetesMarkerFields {
  readonly release: string;
  readonly namespace: string;
  readonly context?: string;
}

const MARKER_DIR = '.copalibre';
const MARKER_FILE = 'installation.json';

function markerPath(cwd: string): string {
  return join(cwd, MARKER_DIR, MARKER_FILE);
}

/**
 * `wx`-safe, matching `writeLocalDefaults`'s existing pattern for `.env` —
 * refuses to overwrite an existing marker rather than silently re-stamping
 * a directory that's already a real installation. Omitting `kubernetes`
 * writes a `compose`-mode marker; passing it writes a `kubernetes`-mode one.
 */
export async function writeInstallationMarker(
  cwd: string,
  version: string,
  kubernetes?: KubernetesMarkerFields,
): Promise<InstallationMarker> {
  const marker: InstallationMarker = kubernetes
    ? {
        version,
        installId: newId(),
        mode: 'kubernetes',
        createdAt: new Date().toISOString(),
        ...kubernetes,
      }
    : {
        version,
        installId: newId(),
        mode: 'compose',
        createdAt: new Date().toISOString(),
      };
  const path = markerPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(marker, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  await chmod(path, 0o600);
  return marker;
}

/** `undefined` when the current directory holds no installation marker. */
export async function readInstallationMarker(cwd: string): Promise<InstallationMarker | undefined> {
  try {
    const contents = await readFile(markerPath(cwd), 'utf8');
    return JSON.parse(contents) as InstallationMarker;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

/**
 * Terraform's `required_version`-against-state relationship, applied here:
 * a directory stays pinned to the CLI version that created it. Running
 * several CopaLibre versions side by side means running the matching CLI
 * version per directory, not one binary managing every schema version
 * (the design decision) — so a mismatch is refused explicitly rather
 * than silently risking the wrong migration/compose shape.
 */
export function assertVersionCompatible(
  marker: InstallationMarker,
  runningCliVersion: string,
): void {
  if (marker.version === runningCliVersion) return;
  throw new Error(
    `This directory was set up by CopaLibre CLI ${marker.version}, but the running CLI is ` +
      `${runningCliVersion}. Run the matching CLI version for this directory, or "copalibre init" ` +
      'a fresh directory with the running version.',
  );
}

/**
 * Duck-typed, not `error instanceof Error` — under Jest's
 * `--experimental-vm-modules`, a real `fs` error can cross a VM-realm
 * boundary where `instanceof` fails even though the error is structurally
 * exactly right (found via a failing test, not assumed).
 */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}
