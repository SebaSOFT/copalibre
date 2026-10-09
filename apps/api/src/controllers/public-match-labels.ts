import type { DisciplineDescriptor, EventDefinition } from '@copalibre/domain';
import { resolveLabel } from '@copalibre/domain';
import type {
  PublicMatchEventResponse,
  PublicRosterRoleResponse,
} from '../dto/public-tournament.dto.js';

/**
 * An event's display labels for the public match report: the English `label` every client can rely
 * on, plus every declared language when the descriptor localizes it, so the page can pick the
 * reader's language instead of the API fixing it at English.
 */
export function eventLabelFields(
  definition: Pick<EventDefinition, 'label'> | undefined,
  fallbackCode: string,
): Pick<PublicMatchEventResponse, 'label' | 'labels'> {
  if (definition === undefined) return { label: fallbackCode };
  return {
    label: resolveLabel(definition.label, 'en'),
    ...(typeof definition.label === 'string' ? {} : { labels: definition.label }),
  };
}

/** The discipline's declared roster roles, so a client can label each member's role codes. */
export function rosterRolesOf(
  descriptor: Pick<DisciplineDescriptor, 'rosterRoles'>,
): PublicRosterRoleResponse[] | undefined {
  return descriptor.rosterRoles?.map(({ code, badge, label }) => ({
    code,
    ...(badge === undefined ? {} : { badge }),
    label,
  }));
}
