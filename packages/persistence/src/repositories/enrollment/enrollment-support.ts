import { Abbreviation, Alias } from '@copalibre/domain';
import { InvariantViolationError } from '../../errors.js';

export interface AuditContext {
  readonly organizationId: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

export interface ParticipantTeamMembership {
  readonly playerId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly role: string;
}

export interface ParticipantReportedResult {
  readonly matchId: string;
  readonly entrantId: string;
  readonly status: string;
  readonly result: Record<string, unknown> | null;
}

/**
 * Refuses a malformed abbreviation before any SQL runs.
 *
 * A check constraint could enforce the shape, and its error would say
 * `violates check constraint "teams_abbreviation"`. The organizer needs to know
 * that lowercase is not allowed and why, which is what the value object says.
 */
export function assertAbbreviation(value: string | undefined): void {
  if (value === undefined) return;
  const abbreviation = Abbreviation.create(value);
  if (!abbreviation.ok) {
    throw new InvariantViolationError(abbreviation.error.message, { abbreviation: value });
  }
}

/** Refuses a malformed club alias with the reason, rather than with a unique-index error. */
export function assertClubAlias(value: string | undefined): void {
  if (value === undefined) return;
  const alias = Alias.create('club', value);
  if (!alias.ok) {
    throw new InvariantViolationError(alias.error.message, { alias: value });
  }
}

/** Refuses a malformed team alias with the reason, rather than with a unique-index error. */
export function assertEntrantAlias(value: string | undefined): void {
  if (value === undefined) return;
  const alias = Alias.create('entrant', value);
  if (!alias.ok) {
    throw new InvariantViolationError(alias.error.message, { alias: value });
  }
}

export function nextAlias(prefix: string, aliases: readonly string[]): string {
  let ordinal = 1;
  while (aliases.includes(`${prefix}-${ordinal}`)) ordinal += 1;
  return `${prefix}-${ordinal}`;
}
