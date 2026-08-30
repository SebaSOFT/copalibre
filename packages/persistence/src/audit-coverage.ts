// Enforces the accepted "An unaudited aggregate mutation fails the build"
// requirement (openspec 0166): a repository method that writes through
// `uow.tx` (the only way to reach a transaction — see transaction.ts) while
// holding a `UnitOfWork` must also call `uow.recordAudit`, or be named in
// `AUDIT_COVERAGE_EXCEPTIONS` with a reason. Pure, testable functions plus a
// thin caller in audit-coverage.test.ts, mirroring
// scripts/check-help-coverage.mjs's shape.

const MUTATING_CALL = /\buow\.tx[\s\S]*?\.(insertInto|updateTable|deleteFrom)\(/;
const RECORDS_AUDIT = /\buow\.recordAudit\(/;
const TAKES_UNIT_OF_WORK = /\buow\s*:\s*UnitOfWork\b/;

export interface RepositoryMethod {
  readonly name: string;
  readonly body: string;
}

/**
 * Splits a repository source file into its class methods, trusting this
 * codebase's consistent Prettier formatting: every method is a class member
 * at exactly two-space indent, opening on a line ending `{` and closing on a
 * line that is exactly `  }` — the same assumption
 * `check-help-coverage.mjs`'s scenario-block parser makes about scenario
 * headings.
 */
export function classMethods(sourceText: string): readonly RepositoryMethod[] {
  const lines = sourceText.split('\n');
  const methods: RepositoryMethod[] = [];
  const NAME =
    /^ {2}(?:private |public |protected |static |async |readonly )*([a-zA-Z_$][\w$]*)\s*\(/;

  let current: { name: string; lines: string[] } | undefined;
  for (const line of lines) {
    if (current === undefined) {
      const match = NAME.exec(line);
      const name = match?.[1];
      if (name !== undefined && name !== 'constructor') {
        if (line.trimEnd().endsWith('{}')) {
          // An empty-bodied method opening and closing on the same line.
          methods.push({ name, body: line });
          continue;
        }
        current = { name, lines: [line] };
      }
      continue;
    }
    current.lines.push(line);
    if (line === '  }') {
      methods.push({ name: current.name, body: current.lines.join('\n') });
      current = undefined;
    }
  }
  return methods;
}

/** A method that writes into a table through the transaction a `UnitOfWork` carries. */
export function mutatesViaUnitOfWork(method: RepositoryMethod): boolean {
  return TAKES_UNIT_OF_WORK.test(method.body) && MUTATING_CALL.test(method.body);
}

export function recordsAudit(method: RepositoryMethod): boolean {
  return RECORDS_AUDIT.test(method.body);
}

/**
 * Methods that mutate through a `UnitOfWork`'s transaction without recording
 * an audit entry, deliberately: bookkeeping the product contract does not
 * class as an operator action; see each comment for why.
 */
export const AUDIT_COVERAGE_EXCEPTIONS: Readonly<Record<string, string>> = Object.freeze({
  'match-command-idempotency-repository.ts:record':
    'idempotency bookkeeping for a finalization retry, not an aggregate mutation',
  'collector-threshold-consumption-repository.ts:record':
    "a rule's derived running total, replaced on every evaluation, not an operator action",
  'csv-import-repository.ts:markValidating':
    'internal import-session state machine; the operator action is the eventual commit, audited as csv-import.committed',
  'csv-import-repository.ts:storePreview':
    'internal import-session state machine; the operator action is the eventual commit, audited as csv-import.committed',
  'csv-import-repository.ts:markCommitting':
    'internal import-session state machine; the operator action is the eventual commit, audited as csv-import.committed',
  'csv-import-repository.ts:markCommitted':
    'internal import-session state machine; the operator action is the eventual commit, audited as csv-import.committed',
  'competition-repository.ts:anullSurplusMatches':
    'a series-consequence side effect of a finalize the caller already audits as match.finalized, not a distinct operator action',
  'auth-verification-token-repository.ts:create':
    'ephemeral verification-token bookkeeping; the account change it authorizes is audited where it is applied (identity.password-reset)',
  'auth-verification-token-repository.ts:consume':
    'ephemeral verification-token bookkeeping; the account change it authorizes is audited where it is applied (identity.password-reset)',
  'identity-principal-repository.ts:findOrCreateByEmail':
    'a principal auto-provisioned as a step of linkParticipant, which already records participant.identity-linked for the operator action that caused it',
  'competition-record-repository.ts:materialiseStandings':
    'a derived recalculation written inside the same transaction as the match finalize that caused it, already recorded as match.finalized — a second entry for its own consequence would be noise, not a distinct operator action',
  'csv-import-repository.ts:create':
    'internal import-session state machine; the operator action is the eventual commit, audited as csv-import.committed',
  'declared-effect-repository.ts:recordOnce':
    "a durable idempotency boundary for a rule script's declared effects, not an operator action",
  'installed-module-repository.ts:saveAsset':
    'an asset written as part of an install already recorded as module.installed, not a distinct operator decision',
  'object-metadata-repository.ts:save':
    'generic object-storage registration accompanying a domain-level upload action that records its own audit entry (e.g. person.photo-set, an emblem set)',
  'statistic-repository.ts:projectMatch':
    'a projection rebuild recomputing derived totals from match events, not an operator action',
});

export interface UncoveredMutation {
  readonly file: string;
  readonly method: string;
}

/** @param filesBySourceName file basename (e.g. `person-repository.ts`) -> its source text */
export function uncoveredMutations(
  filesBySourceName: ReadonlyMap<string, string>,
): readonly UncoveredMutation[] {
  const uncovered: UncoveredMutation[] = [];
  for (const [file, sourceText] of filesBySourceName) {
    for (const method of classMethods(sourceText)) {
      if (!mutatesViaUnitOfWork(method) || recordsAudit(method)) continue;
      if (AUDIT_COVERAGE_EXCEPTIONS[`${file}:${method.name}`] !== undefined) continue;
      uncovered.push({ file, method: method.name });
    }
  }
  return uncovered;
}
