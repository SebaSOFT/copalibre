import { isPlacementFormat, SUPPORTED_FORMATS, type TournamentFormat } from '@copalibre/domain';
import { err, ok, type Result } from '@copalibre/domain';
import { UnsupportedFormatError } from './errors.js';

/**
 * Format allowlist. "The engine must not advertise or simulate support for
 * formats outside this list" (tournament-engine decision record), so this runs
 * at ruleset-configuration time — before generation, and before persistence.
 * The list grew with the two placement formats; the rule did not.
 */
export function assertSupportedFormat(
  format: string,
): Result<TournamentFormat, UnsupportedFormatError> {
  if ((SUPPORTED_FORMATS as readonly string[]).includes(format)) {
    return ok(format as TournamentFormat);
  }
  return err(
    new UnsupportedFormatError(
      `Format "${format}" is not supported. The engine supports exactly: ${SUPPORTED_FORMATS.join(', ')}.`,
      { format, supported: SUPPORTED_FORMATS },
    ),
  );
}

/** Formats whose structure is a knockout tree (advancement moves entrants). */
export function isEliminationFormat(format: TournamentFormat): boolean {
  return (
    format === 'single-elimination' || format === 'double-elimination' || format === 'gauntlet'
  );
}

/** Formats using sequential ladder/stepladder brackets (Gauntlet format). */
export function isGauntletFormat(format: TournamentFormat): boolean {
  return format === 'gauntlet';
}

/** Formats using dual-tournament bracket groups (GSL format). */
export function isBracketGroupsFormat(format: TournamentFormat): boolean {
  return format === 'bracket-groups';
}

/** Formats using dynamic round-by-round Swiss pairing. */
export function isSwissFormat(format: TournamentFormat): boolean {
  return format === 'swiss';
}

/** Formats using custom user-defined directed acyclic fixture graphs. */
export function isCustomBracketFormat(format: TournamentFormat): boolean {
  return format === 'custom-bracket';
}

/** Formats using multi-round knockout elimination trees with top-K advancement. */
export function isFFABracketFormat(format: TournamentFormat): boolean {
  return format === 'ffa-bracket' || format === 'ffa-bracket-groups';
}

/** Formats using multi-round division placement league scheduling. */
export function isFFALeagueFormat(format: TournamentFormat): boolean {
  return format === 'ffa-league';
}

/**
 * Formats where every entrant plays a fixed set of fixtures up front. Placement
 * formats qualify: their rounds are generated at once, they simply produce an
 * ordering rather than a winner.
 */
export function isRoundRobinFormat(format: TournamentFormat): boolean {
  return (
    !isEliminationFormat(format) &&
    !isPlacementFormat(format) &&
    !isBracketGroupsFormat(format) &&
    !isSwissFormat(format) &&
    !isCustomBracketFormat(format)
  );
}
