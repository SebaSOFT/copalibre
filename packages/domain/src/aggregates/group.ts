import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/** A group is a named pool within one zone. */
export interface Group {
  readonly groupId: string;
  readonly zoneId: string;
  /** 1-based, in the order the zone's groups were declared. */
  readonly number: number;
  readonly name: string;
}

export class GroupError extends DomainError {
  readonly code = 'GROUP_INVALID';
}

export function validateGroup(group: Group): Result<Group, GroupError> {
  if (group.name.trim() === '') {
    return err(new GroupError('A group needs a name', { groupId: group.groupId }));
  }
  if (!Number.isInteger(group.number) || group.number < 1) {
    return err(
      new GroupError(`A group's number is 1-based; got ${group.number}`, {
        groupId: group.groupId,
        number: group.number,
      }),
    );
  }
  return ok(group);
}

/** The group every zone gets when an operator has not declared one. */
export const IMPLICIT_GROUP_NAME = 'Grupo único';

/** Whether a group is the zone's only, implicit pool. */
export function isImplicitGroup(group: Pick<Group, 'name' | 'number'>): boolean {
  return group.number === 1 && group.name === IMPLICIT_GROUP_NAME;
}
