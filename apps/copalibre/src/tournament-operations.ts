import { parseArgs } from 'node:util';
import { apiGet, apiPost, type ApiClientConfig } from './api-client.js';
import { readCredential } from './credentials.js';

interface Credential {
  readonly apiUrl: string;
  readonly token: string;
}

/**
 * `organization`/`tournament` commands never fall back to a direct database
 * connection, unlike `module`/`statistics-rebuild`/`backup` (design.md,
 * openspec 0252) — a missing credential is an immediate refusal naming
 * `copalibre login`, not an attempt to reach the database.
 */
async function requireCredential(): Promise<Credential> {
  const stored = await readCredential(process.cwd());
  if (!stored) {
    throw new Error('No stored credential for this directory. Run "copalibre login" first.');
  }
  return { apiUrl: stored.apiUrl, token: stored.token };
}

function clientConfig(credential: Credential): ApiClientConfig {
  return { baseUrl: credential.apiUrl, token: credential.token };
}

interface OrganizationResponse {
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
  readonly primaryLanguage: string;
  readonly timezone: string;
}

export async function organizationGet(arguments_: readonly string[]): Promise<number> {
  const parsed = parseArgs({ args: [...arguments_], allowPositionals: true, strict: true });
  const alias = parsed.positionals[0];
  if (!alias) throw new Error('Usage: copalibre organization get <alias>');
  const credential = await requireCredential();
  const organization = (await apiGet(
    clientConfig(credential),
    `/organizations/${encodeURIComponent(alias)}`,
  )) as OrganizationResponse;
  process.stdout.write(`organizationId: ${organization.organizationId}\n`);
  process.stdout.write(`alias: ${organization.alias}\n`);
  process.stdout.write(`name: ${organization.name}\n`);
  process.stdout.write(`primaryLanguage: ${organization.primaryLanguage}\n`);
  process.stdout.write(`timezone: ${organization.timezone}\n`);
  return 0;
}

interface TournamentResponse {
  readonly tournamentId: string;
  readonly alias: string;
  readonly name: string;
  readonly status: string;
}

function printTournament(tournament: TournamentResponse): void {
  process.stdout.write(`tournamentId: ${tournament.tournamentId}\n`);
  process.stdout.write(`alias: ${tournament.alias}\n`);
  process.stdout.write(`name: ${tournament.name}\n`);
  process.stdout.write(`status: ${tournament.status}\n`);
}

function requiredFlag(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

export async function tournamentList(arguments_: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...arguments_],
    options: { 'organization-alias': { type: 'string' } },
    strict: true,
  });
  const organizationAlias = requiredFlag(
    parsed.values['organization-alias'],
    '--organization-alias',
  );
  const credential = await requireCredential();
  const tournaments = (await apiGet(
    clientConfig(credential),
    `/organizations/${encodeURIComponent(organizationAlias)}/tournaments`,
  )) as readonly TournamentResponse[];
  if (tournaments.length === 0) {
    process.stdout.write('No tournaments.\n');
    return 0;
  }
  for (const tournament of tournaments) {
    process.stdout.write(`${tournament.alias}\t${tournament.name}\t${tournament.status}\n`);
  }
  return 0;
}

export async function tournamentGet(arguments_: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      'organization-alias': { type: 'string' },
      'tournament-alias': { type: 'string' },
    },
    strict: true,
  });
  const organizationAlias = requiredFlag(
    parsed.values['organization-alias'],
    '--organization-alias',
  );
  const tournamentAlias = requiredFlag(parsed.values['tournament-alias'], '--tournament-alias');
  const credential = await requireCredential();
  const tournament = (await apiGet(
    clientConfig(credential),
    `/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}`,
  )) as TournamentResponse;
  printTournament(tournament);
  return 0;
}

export async function tournamentCreate(arguments_: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      'organization-alias': { type: 'string' },
      alias: { type: 'string' },
      name: { type: 'string' },
      'descriptor-id': { type: 'string' },
      'descriptor-version': { type: 'string' },
      format: { type: 'string' },
      'public-registration': { type: 'boolean', default: false },
      'requires-check-in': { type: 'boolean', default: false },
    },
    strict: true,
  });
  const values = parsed.values;
  const organizationAlias = requiredFlag(values['organization-alias'], '--organization-alias');
  const alias = requiredFlag(values.alias, '--alias');
  const name = requiredFlag(values.name, '--name');
  const descriptorId = requiredFlag(values['descriptor-id'], '--descriptor-id');
  const descriptorVersion = requiredFlag(values['descriptor-version'], '--descriptor-version');
  const format = requiredFlag(values.format, '--format');
  const credential = await requireCredential();
  const tournament = (await apiPost(
    clientConfig(credential),
    `/organizations/${encodeURIComponent(organizationAlias)}/tournaments`,
    {
      alias,
      name,
      descriptorId,
      descriptorVersion,
      // See tournament-tools.ts's createTournamentTool: apps/api takes a
      // `stages` array (each stage carrying its own `format`); this command
      // exposes the common single-stage case as a plain `--format` flag and
      // wraps it into the one-stage shape the API requires.
      stages: [{ format }],
      publicRegistration: values['public-registration'],
      requiresCheckIn: values['requires-check-in'],
    },
  )) as TournamentResponse;
  printTournament(tournament);
  return 0;
}

export async function tournamentPublish(arguments_: readonly string[]): Promise<number> {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      'organization-alias': { type: 'string' },
      'tournament-alias': { type: 'string' },
    },
    strict: true,
  });
  const organizationAlias = requiredFlag(
    parsed.values['organization-alias'],
    '--organization-alias',
  );
  const tournamentAlias = requiredFlag(parsed.values['tournament-alias'], '--tournament-alias');
  const credential = await requireCredential();
  const tournament = (await apiPost(
    clientConfig(credential),
    `/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/publish`,
  )) as TournamentResponse;
  printTournament(tournament);
  return 0;
}
