import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import type { TournamentProfile } from '../profiles/tournament-profile.js';
import {
  resolveRequirement,
  type CapabilityBinding,
  type ResolvedCapability,
} from './capability.js';

export class UnsatisfiedCapabilityError extends DomainError {
  readonly code = 'UNSATISFIED_REQUIRED_CAPABILITY';

  constructor(
    readonly unsatisfied: readonly string[],
    readonly partial: CapabilityBinding,
  ) {
    super(
      `Discipline does not satisfy required capabilities: ${unsatisfied.join(', ')}. ` +
        'Install a discipline declaring them, or bind with an explicit override.',
      { unsatisfied },
    );
  }
}

export interface BindOptions {
  /**
   * Proceed despite unsatisfied required capabilities. The dependency is
   * deliberately soft — a forced binding degrades rather than fails — and the
   * gap is recorded on the binding so it surfaces in the audit trail and in
   * standings traces, not only at install time.
   */
  readonly overrideUnsatisfied?: boolean;
}

/**
 * Binds a profile's capability requirements to a discipline's declared codes.
 *
 * The set of codes a discipline provides is inferred from its declared
 * statistics and scoring inputs. Whether disciplines should instead declare a
 * `provides` list explicitly is an open question in this change's design; the
 * inference is sufficient for the MVP vocabulary and avoids duplicating what
 * the descriptor already states.
 */
export function bindCapabilities(
  descriptor: DisciplineDescriptor,
  profile: TournamentProfile,
  options?: BindOptions,
): Result<CapabilityBinding, UnsatisfiedCapabilityError> {
  const declared = declaredCodes(descriptor);
  const resolved: ResolvedCapability[] = profile.requires.map((requirement) =>
    resolveRequirement(requirement, declared),
  );

  const unsatisfiedRequired = resolved
    .filter((entry) => entry.necessity === 'required' && !entry.satisfied)
    .map((entry) => entry.capability);

  const binding: CapabilityBinding = {
    descriptorId: descriptor.descriptorId,
    descriptorVersion: descriptor.version,
    profileId: profile.profileId,
    profileVersion: profile.version,
    resolved,
    unsatisfiedRequired,
    overridden: unsatisfiedRequired.length > 0 && options?.overrideUnsatisfied === true,
  };

  if (unsatisfiedRequired.length > 0 && !options?.overrideUnsatisfied) {
    return err(new UnsatisfiedCapabilityError(unsatisfiedRequired, binding));
  }
  return ok(binding);
}

/** Codes a discipline provides: its statistics and scoring inputs. */
export function declaredCodes(descriptor: DisciplineDescriptor): ReadonlySet<string> {
  return new Set<string>([
    ...descriptor.statistics.map((statistic) => statistic.code),
    ...descriptor.scoringInputs.map((input) => input.code),
  ]);
}
