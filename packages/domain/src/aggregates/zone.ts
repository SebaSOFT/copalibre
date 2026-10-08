import type { TournamentFormat } from '../descriptors/discipline-descriptor.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/** A zone is a named partition of one stage. */
export interface Zone {
  readonly zoneId: string;
  readonly stageId: string;
  /** 1-based, in the order the stage's zones were declared. */
  readonly number: number;
  readonly name: string;
  /**
   * The format this zone plays when it differs from its stage's. Absent means the zone inherits
   * `Stage.format`, which is every zone of every tournament that predates zone formats.
   */
  readonly format?: TournamentFormat;
}

export class ZoneError extends DomainError {
  readonly code = 'ZONE_INVALID';
}

export function validateZone(zone: Zone): Result<Zone, ZoneError> {
  if (zone.name.trim() === '') {
    return err(new ZoneError('A zone needs a name', { zoneId: zone.zoneId }));
  }
  if (!Number.isInteger(zone.number) || zone.number < 1) {
    return err(
      new ZoneError(`A zone's number is 1-based; got ${zone.number}`, {
        zoneId: zone.zoneId,
        number: zone.number,
      }),
    );
  }
  return ok(zone);
}

/** The format a zone plays: its own when it declares one, otherwise its stage's. */
export function effectiveFormat(
  zone: Pick<Zone, 'format'>,
  stage: { readonly format: TournamentFormat },
): TournamentFormat {
  return zone.format ?? stage.format;
}

/** Formats that decide a winner through a bracket and rank nobody in a points table. */
const KNOCKOUT_ONLY_FORMATS: readonly TournamentFormat[] = [
  'single-elimination',
  'double-elimination',
  'gauntlet',
  'custom-bracket',
  'ffa-bracket',
];

/**
 * Whether a zone playing this format is ranked in a standings table. Knockout brackets are not;
 * leagues, round-robins, Swiss and the group phase of group-then-bracket formats are.
 */
export function producesStandingsTable(format: TournamentFormat): boolean {
  return !KNOCKOUT_ONLY_FORMATS.includes(format);
}

/**
 * A format declared on a zone must be one the tournament's discipline offers, the same rule a
 * stage's format is held to.
 */
export function validateZoneFormat(
  zone: Pick<Zone, 'zoneId'>,
  format: TournamentFormat,
  availableFormats: readonly TournamentFormat[],
): Result<TournamentFormat, ZoneError> {
  if (!availableFormats.includes(format)) {
    return err(
      new ZoneError(
        `Format "${format}" is not offered by the discipline (available: ${
          availableFormats.join(', ') || '(none)'
        })`,
        { zoneId: zone.zoneId, format },
      ),
    );
  }
  return ok(format);
}

/** The zone every stage gets when an operator has not declared one. */
export const IMPLICIT_ZONE_NAME = 'Zona única';

/** Whether a zone is the stage's only, implicit partition. */
export function isImplicitZone(zone: Pick<Zone, 'name' | 'number'>): boolean {
  return zone.number === 1 && zone.name === IMPLICIT_ZONE_NAME;
}
