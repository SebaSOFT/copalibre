import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/** A zone is a named partition of one stage. */
export interface Zone {
  readonly zoneId: string;
  readonly stageId: string;
  /** 1-based, in the order the stage's zones were declared. */
  readonly number: number;
  readonly name: string;
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

/** The zone every stage gets when an operator has not declared one. */
export const IMPLICIT_ZONE_NAME = 'Zona única';

/** Whether a zone is the stage's only, implicit partition. */
export function isImplicitZone(zone: Pick<Zone, 'name' | 'number'>): boolean {
  return zone.number === 1 && zone.name === IMPLICIT_ZONE_NAME;
}
