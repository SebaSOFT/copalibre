import { MVP_FORMATS, type TournamentFormat } from '@copalibre/domain';
import { err, ok, type Result } from '@copalibre/domain';
import { UnsupportedFormatError } from './errors.js';

/**
 * Format allowlist. "The engine must not advertise or simulate support for
 * formats outside this list" (tournament-engine decision record), so this runs
 * at ruleset-configuration time — before generation, and before persistence.
 */
export function assertSupportedFormat(
  format: string,
): Result<TournamentFormat, UnsupportedFormatError> {
  if ((MVP_FORMATS as readonly string[]).includes(format)) {
    return ok(format as TournamentFormat);
  }
  return err(
    new UnsupportedFormatError(
      `Format "${format}" is not supported. The engine supports exactly: ${MVP_FORMATS.join(', ')}.`,
      { format, supported: MVP_FORMATS },
    ),
  );
}

/** Formats whose structure is a knockout tree (advancement moves entrants). */
export function isEliminationFormat(format: TournamentFormat): boolean {
  return format === 'single-elimination' || format === 'double-elimination';
}

/** Formats where every entrant plays a fixed set of fixtures up front. */
export function isRoundRobinFormat(format: TournamentFormat): boolean {
  return !isEliminationFormat(format);
}
