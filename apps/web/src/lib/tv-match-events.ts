import type { PublicMatchReportResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';

/**
 * One recorded match event, adapted for the TV ticker (openspec 0270) from the same
 * `fetchMatchReport` data the public match report page already reads (`match-report.ts`) — a second
 * consumer of that data, not a new source. `side` distinguishes which entrant the event belongs to,
 * which the public match report has no need to carry but the TV ticker does (it shows both sides at
 * once, not one team's own roster table).
 */
export interface TvMatchEvent {
  readonly eventId: string;
  readonly label: string;
  readonly occurredAt: string;
  readonly side?: 'home' | 'away';
  readonly actor?: string;
}

/**
 * Every recorded event of one match, generic over its `definitionCode` — a goal, a card, or
 * whatever else the installed discipline declares — rather than a hardcoded goal/card list.
 */
export function buildTvMatchEvents(response: PublicMatchReportResponse): readonly TvMatchEvent[] {
  const actors = new Map(
    [...response.rosters.home, ...response.rosters.away].map((member) => [
      member.personId,
      member.number === undefined ? member.name : `#${member.number} ${member.name}`,
    ]),
  );

  return response.timeline.map((event) => ({
    eventId: event.eventId,
    label: event.label,
    occurredAt: event.occurredAt,
    ...(event.side === undefined
      ? {}
      : event.side === response.homeEntrantId
        ? { side: 'home' as const }
        : event.side === response.awayEntrantId
          ? { side: 'away' as const }
          : {}),
    ...(event.personId === undefined || !actors.has(event.personId)
      ? {}
      : { actor: actors.get(event.personId) }),
  }));
}
