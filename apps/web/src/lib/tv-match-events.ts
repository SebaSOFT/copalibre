import type { PublicMatchReportResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';

/**
 * One recorded match event, adapted for the TV ticker from the same
 * `fetchMatchReport` data the public match report page already reads (`match-report.ts`) — a second
 * consumer of that data, not a new source. `side` distinguishes which entrant the event belongs to,
 * which the public match report has no need to carry but the TV ticker does (it shows both sides at
 * once, not one team's own roster table).
 */
export interface TvMatchEvent {
  readonly eventId: string;
  /** The discipline's own event code (e.g. "goal", "yellow-card") — generic, never a hardcoded list (the live-event label lookup reuses this as its key). */
  readonly definitionCode: string;
  readonly label: string;
  readonly occurredAt: string;
  readonly side?: 'home' | 'away';
  readonly actor?: string;
}

/**
 * `personId -> display text` ("#7 Juan Pérez", or the bare name with no jersey
 * number), from a match report's rosters — the same public data
 * `PublicMatchReportResponse.rosters` already carries. A plain `Record`, not a
 * `Map`: this crosses into a `client:load` island via Astro's JSON prop
 * serialization, which a `Map` does not survive.
 */
export function buildActorDirectory(
  rosters: PublicMatchReportResponse['rosters'],
): Readonly<Record<string, string>> {
  const actors: Record<string, string> = {};
  for (const member of [...rosters.home, ...rosters.away]) {
    actors[member.personId] =
      member.number === undefined ? member.name : `#${member.number} ${member.name}`;
  }
  return actors;
}

/**
 * `definitionCode -> label` ("Goal", "Yellow card"), from a match report's already-recorded
 * timeline — the vocabulary a live event arriving later over SSE reuses: the live
 * payload itself carries only the code, never a pre-resolved label (`applyTemplate`'s constraint
 * doesn't apply here — this is a plain lookup, not react-intl). A code not yet seen in the initial
 * timeline (the match's first occurrence of it) has no entry; the caller falls back to the bare code.
 */
export function buildEventLabelDirectory(
  response: PublicMatchReportResponse,
): Readonly<Record<string, string>> {
  const labels: Record<string, string> = {};
  for (const event of response.timeline) {
    labels[event.definitionCode] = event.label;
  }
  return labels;
}

/**
 * Resolves one live `match.event-recorded` envelope into the same `TvMatchEvent`
 * shape the initial timeline already produces — `label`/`actor`/`side` resolved the same way
 * `buildTvMatchEvents` resolves them, from directories built once at page load. Returns `undefined`
 * for a payload missing the fields every recorded event has (defensive against an envelope this
 * function's own caller filtered incorrectly, never expected in practice).
 */
export function resolveLiveTvMatchEvent(
  event: { readonly eventId: string; readonly payload: Readonly<Record<string, unknown>> },
  context: {
    readonly homeEntrantId?: string;
    readonly awayEntrantId?: string;
    readonly actors: Readonly<Record<string, string>>;
    readonly labelsByCode: Readonly<Record<string, string>>;
  },
): TvMatchEvent | undefined {
  const { definitionCode, occurredAt, side, personId } = event.payload;
  if (typeof definitionCode !== 'string' || typeof occurredAt !== 'string') return undefined;

  return {
    eventId: event.eventId,
    definitionCode,
    label: context.labelsByCode[definitionCode] ?? definitionCode,
    occurredAt,
    ...(typeof side !== 'string'
      ? {}
      : side === context.homeEntrantId
        ? { side: 'home' as const }
        : side === context.awayEntrantId
          ? { side: 'away' as const }
          : {}),
    ...(typeof personId === 'string' && personId in context.actors
      ? { actor: context.actors[personId] }
      : {}),
  };
}

/**
 * Every recorded event of one match, generic over its `definitionCode` — a goal, a card, or
 * whatever else the installed discipline declares — rather than a hardcoded goal/card list.
 */
export function buildTvMatchEvents(response: PublicMatchReportResponse): readonly TvMatchEvent[] {
  const actors = buildActorDirectory(response.rosters);

  return response.timeline.map((event) => ({
    eventId: event.eventId,
    definitionCode: event.definitionCode,
    label: event.label,
    occurredAt: event.occurredAt,
    ...(event.side === undefined
      ? {}
      : event.side === response.homeEntrantId
        ? { side: 'home' as const }
        : event.side === response.awayEntrantId
          ? { side: 'away' as const }
          : {}),
    ...(event.personId === undefined || !(event.personId in actors)
      ? {}
      : { actor: actors[event.personId] }),
  }));
}
