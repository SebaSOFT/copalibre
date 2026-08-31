import {
  PersonalAccessTokenRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { parseArgs } from 'node:util';

export interface PatCutoverOptions {
  readonly dryRun: boolean;
  readonly confirmed: boolean;
}

export interface PatCutoverResult {
  readonly activeTokens: number;
  readonly revoked: number;
}

export function parsePatCutoverOptions(arguments_: readonly string[]): PatCutoverOptions {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      'dry-run': { type: 'boolean', default: false },
      confirm: { type: 'boolean', default: false },
    },
    strict: true,
  });
  const dryRun = parsed.values['dry-run'] ?? false;
  const confirmed = parsed.values.confirm ?? false;
  if (dryRun && confirmed) throw new Error('use either --dry-run or --confirm, not both');
  return { dryRun, confirmed };
}

export function requirePatCutoverConfirmation(options: PatCutoverOptions): void {
  if (!options.dryRun && !options.confirmed) {
    throw new Error('revoke-legacy-personal-access-tokens requires --confirm (or use --dry-run)');
  }
}

export function patCutoverDryRunMessage(activeTokens: number): string {
  return `Legacy PAT cutover dry run: ${activeTokens} active token(s).`;
}

export function patCutoverCompleteMessage(revoked: number): string {
  return `Legacy PAT cutover complete: ${revoked} token(s) revoked.`;
}

export async function previewPatCutover(db: Kysely<Database>): Promise<number> {
  return new PersonalAccessTokenRepository(db).countActive();
}

export async function executePatCutover(db: Kysely<Database>): Promise<PatCutoverResult> {
  const repository = new PersonalAccessTokenRepository(db);
  const activeTokens = await repository.countActive();
  const { revoked } = await withTransaction(db, (uow) =>
    repository.revokeAllActive(uow, {
      actor: 'operator-cli',
      authorizationContext: 'operator-cli:revoke-legacy-personal-access-tokens',
    }),
  );
  return { activeTokens, revoked };
}
