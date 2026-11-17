import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { identifyCompose, type ComposeOrigin } from './compose-fingerprint.js';
import { reconcileEnvContent } from './compose-reconciler.js';
import { readInstallationMarker } from './installation-marker.js';
import type { ProcessRunner } from './process-runner.js';
import { RELEASED_GATEWAY_CADDYFILE_FINGERPRINTS } from './released-compose-fingerprints.js';
import { createHash } from 'node:crypto';

/** The PostgreSQL volume every release up to 1.2.6 shipped, mounted at `/var/lib/postgresql/data`. */
export const LEGACY_POSTGRES_VOLUME = 'postgres-data';
/** The major version the shipped Compose file runs. */
export const SHIPPED_POSTGRES_MAJOR = 18;

/** An earlier PostgreSQL cluster the installation's data still lives in. */
export interface LegacyPostgres {
  /** Docker's name for the volume, with the Compose project prefix. */
  readonly volume: string;
  readonly major: number;
  /** The image that can read it (the one the installation's own Compose file names). */
  readonly image: string;
}

export interface InstallationSurvey {
  readonly composeOrigin: ComposeOrigin;
  readonly composeContent: string;
  readonly shippedCompose: string;
  readonly gatewayCaddyfile: 'current' | 'released' | 'modified' | 'absent';
  readonly legacyPostgres?: LegacyPostgres;
  /** `.env` keys the upgrade would add or change. */
  readonly envChanges: readonly string[];
  readonly markerVersion?: string;
  readonly project: string;
}

export interface SurveyInputs {
  readonly cwd: string;
  readonly processes: ProcessRunner;
  readonly environment: NodeJS.ProcessEnv;
  readonly targetVersion: string;
  readonly shippedCompose: string;
  readonly shippedCaddyfile: string;
}

interface ComposeDocument {
  readonly name?: string;
  readonly services?: Record<string, { readonly image?: string; readonly volumes?: unknown[] }>;
}

/** Compose's project name: `COMPOSE_PROJECT_NAME`, else the file's `name:`, else the directory's. */
export function composeProjectName(
  composeContent: string,
  cwd: string,
  environment: NodeJS.ProcessEnv,
): string {
  const fromEnvironment = environment.COMPOSE_PROJECT_NAME?.trim();
  if (fromEnvironment) return fromEnvironment;
  const document = parse(composeContent) as ComposeDocument | null;
  if (document?.name) return document.name;
  return (
    cwd
      .split(/[\\/]/)
      .filter(Boolean)
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9_-]/g, '') ?? 'copalibre'
  );
}

/** The image the file's `postgres` service runs, when it mounts the legacy volume. */
export function legacyPostgresImage(composeContent: string): string | undefined {
  const document = parse(composeContent) as ComposeDocument | null;
  const postgres = document?.services?.postgres;
  const mountsLegacy = (postgres?.volumes ?? []).some(
    (volume) => typeof volume === 'string' && volume.startsWith(`${LEGACY_POSTGRES_VOLUME}:`),
  );
  return mountsLegacy ? postgres?.image : undefined;
}

async function capture(
  processes: ProcessRunner,
  arguments_: readonly string[],
): Promise<{ code: number; stdout: string }> {
  if (!processes.capture) throw new Error('this runner cannot inspect Docker');
  const result = await processes.capture('docker', arguments_);
  return { code: result.code, stdout: result.stdout };
}

/** The major version of the cluster in `volume`, from its `PG_VERSION`; undefined with no volume. */
export async function postgresMajorInVolume(
  processes: ProcessRunner,
  volume: string,
  image: string,
): Promise<number | undefined> {
  const inspected = await capture(processes, ['volume', 'inspect', volume]);
  if (inspected.code !== 0) return undefined;
  const read = await capture(processes, [
    'run',
    '--rm',
    '--entrypoint',
    'cat',
    '-v',
    `${volume}:/data:ro`,
    image,
    '/data/PG_VERSION',
  ]);
  const major = Number.parseInt(read.stdout.trim(), 10);
  return read.code === 0 && Number.isFinite(major) ? major : undefined;
}

function gatewayCaddyfileOrigin(
  content: string | undefined,
  shipped: string,
): InstallationSurvey['gatewayCaddyfile'] {
  if (content === undefined) return 'absent';
  const normalise = (text: string): string => text.replace(/\r\n/g, '\n');
  if (normalise(content) === normalise(shipped)) return 'current';
  const fingerprint = createHash('sha256').update(normalise(content), 'utf8').digest('hex');
  return Object.values(RELEASED_GATEWAY_CADDYFILE_FINGERPRINTS).includes(fingerprint)
    ? 'released'
    : 'modified';
}

/**
 * What the installation in `cwd` holds, read from its files and Docker, not from its marker alone: a
 * marker an older CLI moved to the target version still yields the work left to do.
 */
export async function surveyInstallation(inputs: SurveyInputs): Promise<InstallationSurvey> {
  const composeContent = await readFile(join(inputs.cwd, 'docker-compose.yml'), 'utf8');
  const caddyPath = join(inputs.cwd, 'deploy', 'gateway', 'Caddyfile');
  const caddyContent = existsSync(caddyPath) ? await readFile(caddyPath, 'utf8') : undefined;
  const envPath = join(inputs.cwd, '.env');
  const envContent = existsSync(envPath) ? await readFile(envPath, 'utf8') : '';
  const env = reconcileEnvContent(envContent, inputs.targetVersion);
  const project = composeProjectName(composeContent, inputs.cwd, inputs.environment);
  const marker = await readInstallationMarker(inputs.cwd);

  const image = legacyPostgresImage(composeContent);
  let legacyPostgres: LegacyPostgres | undefined;
  if (image) {
    const volume = `${project}_${LEGACY_POSTGRES_VOLUME}`;
    const major = await postgresMajorInVolume(inputs.processes, volume, image);
    if (major !== undefined && major < SHIPPED_POSTGRES_MAJOR) {
      legacyPostgres = { volume, major, image };
    }
  }

  return {
    composeOrigin: identifyCompose(composeContent, inputs.shippedCompose),
    composeContent,
    shippedCompose: inputs.shippedCompose,
    gatewayCaddyfile: gatewayCaddyfileOrigin(caddyContent, inputs.shippedCaddyfile),
    ...(legacyPostgres ? { legacyPostgres } : {}),
    envChanges: [...env.updatedKeys, ...env.addedKeys],
    ...(marker ? { markerVersion: marker.version } : {}),
    project,
  };
}

/** The plan as the operator reads it, one line per step that will run. */
export function describePlan(survey: InstallationSurvey, targetVersion: string): string[] {
  const lines: string[] = [];
  const origin = survey.composeOrigin;
  if (origin.kind === 'modified') {
    lines.push(
      'docker-compose.yml was changed after it was installed: the upgrade writes docker-compose.yml.new and stops.',
    );
    return lines;
  }
  lines.push('Back up the database to backups/ before changing anything.');
  if (origin.kind === 'released') {
    lines.push(
      `Replace docker-compose.yml (as shipped by ${origin.versions.join(', ')}) with ${targetVersion}'s, keeping the old one.`,
    );
  }
  if (survey.gatewayCaddyfile === 'released' || survey.gatewayCaddyfile === 'absent') {
    lines.push(`Install ${targetVersion}'s gateway configuration (deploy/gateway/Caddyfile).`);
  } else if (survey.gatewayCaddyfile === 'modified') {
    lines.push('Keep deploy/gateway/Caddyfile: it was changed after it was installed.');
  }
  if (survey.envChanges.length > 0) {
    lines.push(`Update .env: ${survey.envChanges.join(', ')}.`);
  }
  if (survey.legacyPostgres) {
    lines.push(
      `Move the database from PostgreSQL ${survey.legacyPostgres.major} to ${SHIPPED_POSTGRES_MAJOR} (the stack stops meanwhile), then remove the ${survey.legacyPostgres.major} volume ${survey.legacyPostgres.volume} once everything passes.`,
    );
  }
  lines.push('Pull the images, start the stack, and run doctor.');
  return lines;
}
