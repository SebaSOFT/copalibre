import type { CapabilityBinding } from '../capabilities/capability.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import { hasStarted, type Tournament } from './tournament.js';

export class StartValidationError extends DomainError {
  readonly code = 'TOURNAMENT_START_REFUSED';

  constructor(readonly failures: readonly string[]) {
    super(`Tournament cannot start: ${failures.join('; ')}`, { failures });
  }
}

export class ModuleFrozenError extends DomainError {
  readonly code = 'MODULE_VERSION_FROZEN';
}

/**
 * Preconditions checked when a tournament starts. Starting is triggered by the
 * first match beginning, but the transition is a gate: everything that must be
 * true before results can be recorded is asserted here, in one place, rather
 * than being spread across the operations that follow.
 */
export interface StartPreconditions {
  readonly entrantsLocked: boolean;
  readonly fixturesGenerated: boolean;
  /** Present once a profile has been bound to the discipline. */
  readonly binding?: CapabilityBinding;
  /** Operator knowingly accepted unsatisfied required capabilities. */
  readonly capabilityOverrideAccepted?: boolean;
}

export function validateStart(
  tournament: Tournament,
  preconditions: StartPreconditions,
): Result<true, StartValidationError> {
  const failures: string[] = [];

  if (tournament.status === 'draft') {
    failures.push('tournament is still a draft; publish it before starting');
  }
  if (tournament.status === 'started' || tournament.status === 'finished') {
    failures.push(`tournament is already ${tournament.status}`);
  }
  if (!preconditions.entrantsLocked) {
    failures.push('entrants are not locked');
  }
  if (!preconditions.fixturesGenerated) {
    failures.push('fixtures have not been generated');
  }

  const binding = preconditions.binding;
  if (binding && binding.unsatisfiedRequired.length > 0) {
    // Soft dependency: an operator may proceed, but must say so explicitly at
    // the moment results become possible, not silently at install time.
    const accepted = preconditions.capabilityOverrideAccepted === true || binding.overridden;
    if (!accepted) {
      failures.push(
        `required capabilities are unsatisfied (${binding.unsatisfiedRequired.join(', ')}) ` +
          'and no override was accepted',
      );
    }
  }

  return failures.length > 0 ? err(new StartValidationError(failures)) : ok(true);
}

/**
 * Whether a tournament's discipline or profile version may still change.
 * Once started, it cannot: the audited correction workflow is the only path.
 */
export function canChangeModuleVersion(tournament: Tournament): Result<true, ModuleFrozenError> {
  if (hasStarted(tournament)) {
    return err(
      new ModuleFrozenError(
        `Tournament is ${tournament.status}; its discipline and profile versions are frozen. ` +
          'Use the audited correction workflow.',
        { tournamentId: tournament.tournamentId, status: tournament.status },
      ),
    );
  }
  return ok(true);
}
