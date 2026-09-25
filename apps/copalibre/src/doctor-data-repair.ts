import { createInterface } from 'node:readline/promises';
import type { Kysely } from 'kysely';
import { withTransaction, type Database } from '@copalibre/persistence';
import {
  VALID_TOURNAMENT_STATUSES,
  type DataIntegritySnapshot,
  type InvalidStatusTournament,
  type ValidTournamentStatus,
} from './doctor-data.js';

const ACTOR = 'operator:copalibre-doctor';
const AUTHORIZATION_CONTEXT = 'doctor-repair';

export interface RepairResult {
  readonly kind: 'tournament-status';
  readonly entityId: string;
  readonly auditId: string;
}

/**
 * Corrects one tournament's non-canonical `status` to an operator-confirmed
 * valid one, inside a single `withTransaction` unit of work with an
 * `audit_log` entry — never a silent rewrite (design.md Decision 3).
 */
export async function repairTournamentStatus(
  db: Kysely<Database>,
  tournament: InvalidStatusTournament,
  status: ValidTournamentStatus,
): Promise<RepairResult> {
  return withTransaction(db, async (uow) => {
    await uow.tx
      .updateTable('tournaments')
      .set({ status })
      .where('tournament_id', '=', tournament.tournamentId)
      .execute();
    const auditId = await uow.recordAudit({
      organizationId: tournament.organizationId,
      entityType: 'tournament',
      entityId: tournament.tournamentId,
      action: 'data-integrity.repaired',
      actor: ACTOR,
      authorizationContext: AUTHORIZATION_CONTEXT,
      previousState: { status: tournament.status },
      resultingState: { status },
      reason: `copalibre doctor --fix: corrected non-canonical tournament status '${tournament.status}' to '${status}'`,
    });
    return { kind: 'tournament-status', entityId: tournament.tournamentId, auditId };
  });
}

/** Repair actions `runInteractiveRepair` calls through — real ones touch the database; tests fake them. */
export interface RepairActions {
  repairTournamentStatus(
    tournament: InvalidStatusTournament,
    status: ValidTournamentStatus,
  ): Promise<RepairResult>;
}

export function createRepairActions(db: Kysely<Database>): RepairActions {
  return {
    repairTournamentStatus: (tournament, status) => repairTournamentStatus(db, tournament, status),
  };
}

/**
 * Decision-support prompt (design.md Decision 2): presents each fixable
 * anomaly, its resolution options, and a confirmation before committing.
 * Node's built-in `readline/promises` rather than a TUI library — the
 * standalone SEA binary externalizes native bindings and stays dependency-thin
 * (design.md "Open gate: interactive prompt library in standalone SEA CLI").
 */
export interface Prompter {
  readonly isInteractive: boolean;
  select<T extends string>(
    question: string,
    options: readonly { readonly value: T; readonly label: string }[],
  ): Promise<T | undefined>;
  confirm(question: string): Promise<boolean>;
  close(): void;
}

export function createPrompter(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
  isTTY: boolean = process.stdin.isTTY === true,
): Prompter {
  const rl = isTTY ? createInterface({ input, output }) : undefined;
  return {
    isInteractive: isTTY,
    async select(question, options) {
      if (!rl) return undefined;
      output.write(`${question}\n`);
      options.forEach((option, index) => output.write(`  ${index + 1}. ${option.label}\n`));
      const answer = (await rl.question(`Choose 1-${options.length} (Enter to skip): `)).trim();
      const index = Number(answer) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= options.length) return undefined;
      return options[index]?.value;
    },
    async confirm(question) {
      if (!rl) return false;
      const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    },
    close() {
      rl?.close();
    },
  };
}

/**
 * Walks every fixable anomaly in `snapshot`, prompting for a resolution and a
 * confirmation before applying it. Returns the number of repairs actually
 * applied. Requires a TTY (`prompter.isInteractive`) — with none, it reports
 * that and applies nothing, rather than guessing (design.md Non-Goals:
 * `copalibre doctor` never mutates data without explicit confirmation).
 */
export async function runInteractiveRepair(
  snapshot: DataIntegritySnapshot,
  prompter: Prompter,
  actions: RepairActions,
  log: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Promise<number> {
  if (!prompter.isInteractive) {
    log(
      '--fix requires an interactive terminal (TTY); no repairs were applied. ' +
        'Re-run "copalibre doctor --fix" from an interactive shell to repair the anomalies reported above.',
    );
    return 0;
  }

  let applied = 0;
  for (const tournament of snapshot.invalidStatusTournaments) {
    log(
      `\nTournament "${tournament.name}" (${tournament.tournamentId}) has status ` +
        `'${tournament.status}', which is not canonical.`,
    );
    const target = await prompter.select(
      'Choose the correct status',
      VALID_TOURNAMENT_STATUSES.map((status) => ({ value: status, label: status })),
    );
    if (!target) {
      log('Skipped.');
      continue;
    }
    const confirmed = await prompter.confirm(`Set status to '${target}'?`);
    if (!confirmed) {
      log('Skipped.');
      continue;
    }
    await actions.repairTournamentStatus(tournament, target);
    applied += 1;
    log(`Fixed: tournament ${tournament.tournamentId} status -> '${target}'.`);
  }

  log(`\n${applied} repair(s) applied.`);
  return applied;
}
