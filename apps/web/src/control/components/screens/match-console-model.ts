import type {
  ConsoleEventDefinition,
  ConsoleMatchEvent,
  ConsoleSegment,
  MatchConsoleResponse,
} from '../../lib/api-client.js';
import { eventSyncKey } from '../../lib/match-console.js';
import type { QueuedMutation } from '../../lib/offline-queue.js';

export const segmentIdOf = (segment: ConsoleSegment | undefined): string =>
  segment?.segmentId ?? '';

export const variantOf = (primary: boolean): 'primary' | 'secondary' =>
  primary ? 'primary' : 'secondary';

/** The secondary actor fields of the permitted events, one per field name, keeping the first label. */
export function secondaryActorFieldsOf(permittedEvents: readonly ConsoleEventDefinition[]) {
  // Deduplicated by field name, keeping the first declaration's label: two
  // event definitions may prompt for the same field, and the chip row shows it
  // once.
  return [
    ...new Map(
      permittedEvents
        .flatMap((definition) => definition.secondaryActorFields)
        .map((entry) => [entry.field, entry] as const),
    ).values(),
  ];
}

/** The load-data action's href: shown only while a scheduled match has no segments and no events. */
export function matchConsoleLoadDataHrefOf({
  matchId,
  organizationAlias,
  projection,
  tournamentAlias,
}: {
  readonly matchId: string;
  readonly organizationAlias: string;
  readonly projection: MatchConsoleResponse;
  readonly tournamentAlias: string;
}): string | undefined {
  if (
    projection.status !== 'scheduled' ||
    projection.segments.length > 0 ||
    projection.events.length > 0
  ) {
    return undefined;
  }

  return `/control/${organizationAlias}/tournaments/${tournamentAlias}/matches/${matchId}/load`;
}

/** The events still queued offline, shaped as projected events so the ledger can show them now. */
export function queuedEventsOf(
  projection: MatchConsoleResponse,
  pendingMutations: readonly QueuedMutation[],
): ConsoleMatchEvent[] {
  return pendingMutations.flatMap((mutation, index) => {
    if (mutation.action.kind !== 'record-event') return [];
    const request = mutation.action.request;
    const event = {
      eventId: `queued-${mutation.id}`,
      definitionCode: request.definitionCode,
      segmentId: request.segmentId,
      sequence: projection.events.length + index + 1,
      occurredAt: new Date(request.occurredAt).toISOString(),
      ...(request.side === undefined ? {} : { side: request.side }),
      ...(request.personId === undefined ? {} : { personId: request.personId }),
      ...(request.notes === undefined ? {} : { notes: request.notes }),
    };
    return projection.events.some((projected) => eventSyncKey(projected) === eventSyncKey(event))
      ? []
      : [event];
  });
}

export function matchConsoleBreadcrumbsOf({
  organizationAlias,
  projection,
  tournamentAlias,
  tournamentName,
  tournamentNameLoading,
}: {
  readonly organizationAlias: string;
  readonly projection: MatchConsoleResponse;
  readonly tournamentAlias: string;
  readonly tournamentName?: string | null;
  readonly tournamentNameLoading: boolean;
}) {
  const homeName = projection.entrants.find(
    ({ entrantId }) => entrantId === projection.homeEntrantId,
  )?.name;
  const awayName = projection.entrants.find(
    ({ entrantId }) => entrantId === projection.awayEntrantId,
  )?.name;
  const matchName = homeName && awayName ? `${homeName} vs ${awayName}` : undefined;
  const tournamentBreadcrumb = tournamentName
    ? {
        label: tournamentName,
        href: `/control/${organizationAlias}/tournaments/${tournamentAlias}`,
      }
    : tournamentNameLoading
      ? { label: '', loading: true }
      : undefined;

  return [
    ...(tournamentBreadcrumb ? [tournamentBreadcrumb] : []),
    ...(matchName ? [{ label: matchName, current: true }] : []),
  ];
}
