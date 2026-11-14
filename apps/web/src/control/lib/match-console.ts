/**
 * Pure derivation logic for the live match console, extracted from
 * `MatchConsolePage.tsx` so it is unit-testable in isolation rather
 * than only reachable through a full component render.
 */

import { v7 as uuidv7 } from 'uuid';
import { applyTemplate } from '../../lib/matches-view.js';
import {
  formatSideSource,
  sourceMatchLabel,
  type SideSource,
  type SideSourceMessages,
} from '../../lib/side-source.js';
import type {
  ConsoleEventDefinition,
  ConsoleMatchEvent,
  ConsoleRoster,
  ConsoleRosterMember,
  ConsoleSegment,
  MatchConsoleResponse,
  SegmentClockCommand,
} from './api-client.js';

export function newIdempotencyKey(): string {
  return uuidv7();
}

export function currentEpochMilliseconds(): number {
  return Date.now();
}

export function eventSyncKey(
  event: Pick<ConsoleMatchEvent, 'definitionCode' | 'segmentId' | 'occurredAt'>,
): string {
  return `${event.definitionCode}\u0000${event.segmentId}\u0000${Date.parse(event.occurredAt)}`;
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function descriptionFor(
  definition: ConsoleEventDefinition,
  description: string,
): string | undefined {
  if (description.trim() === '') return undefined;
  const properties = definition.payloadSchema.properties;
  if (typeof properties !== 'object' || properties === null || !('description' in properties)) {
    return undefined;
  }
  return description.trim();
}

/**
 * `unknownSegmentLabel` is caller-supplied (rather than a fixed fallback
 * string here) so this stays a plain, `intl`-free function testable without
 * a React context — the caller resolves the translated fallback, and the
 * per-segment `typeText`, via `useIntl()`/`resolveLabel()`.
 */
export function segmentLabel(
  projection: MatchConsoleResponse,
  segmentId: string,
  unknownSegmentLabel: string,
  typeText?: (segment: MatchConsoleResponse['segments'][number]) => string,
): string {
  const segment = projection.segments.find((candidate) => candidate.segmentId === segmentId);
  if (!segment) return unknownSegmentLabel;
  return `${typeText ? typeText(segment) : segment.type} ${segment.number}`;
}

/**
 * The segment the match is in: the one running, else the first not yet ended (a paused half, or
 * the next one), else the last played. `segments` arrive ordered by number.
 */
export function currentSegmentOf(segments: readonly ConsoleSegment[]): ConsoleSegment | undefined {
  return (
    segments.find((segment) => segment.state === 'active') ??
    segments.find((segment) => segment.state !== 'completed') ??
    segments.at(-1)
  );
}

/** The operator's explicit pick while it still names a segment of this match, else the current one. */
export function selectedSegmentOf(
  segments: readonly ConsoleSegment[],
  pickedSegmentId: string,
): ConsoleSegment | undefined {
  return (
    segments.find((segment) => segment.segmentId === pickedSegmentId) ?? currentSegmentOf(segments)
  );
}

export interface ClockActions {
  /** Only the commands the match state allows, in the order they are shown. */
  readonly commands: readonly {
    readonly command: SegmentClockCommand;
    readonly primary: boolean;
  }[];
  /** Whether Finalize is the one primary action: nothing is left to run. */
  readonly finalizePrimary: boolean;
}

/**
 * What the clock card and the finalize card offer for the selected segment, so the console shows
 * one primary action per state. A stopped clock offers Start (a resume once the match is under
 * way), a running one offers Pause, and an ended segment offers nothing; only a match with no
 * segment left to play makes Finalize the primary action. The match state, not the capability,
 * decides here: a missing capability disables what is offered, it does not change what is offered.
 */
export function clockActionsOf(
  status: MatchConsoleResponse['status'],
  segments: readonly ConsoleSegment[],
  selected: ConsoleSegment | undefined,
): ClockActions {
  const finalizePrimary =
    status === 'in-progress' && segments.every((segment) => segment.state === 'completed');
  if (selected === undefined || selected.state === 'completed') {
    return { commands: [], finalizePrimary };
  }
  if (status === 'scheduled') {
    return { commands: [{ command: 'start', primary: true }], finalizePrimary };
  }
  if (status !== 'in-progress') return { commands: [], finalizePrimary };
  return {
    commands: [
      selected.state === 'active'
        ? { command: 'pause', primary: true }
        : { command: 'resume', primary: true },
      { command: 'end', primary: false },
    ],
    finalizePrimary,
  };
}

/**
 * Whether an event definition belongs in the recording palette right now:
 * gated by the active segment's type and, per actor requirement, by whether
 * an eligible actor to attribute it to actually exists.
 */
export function isEventPermitted(
  definition: ConsoleEventDefinition,
  projection: Pick<MatchConsoleResponse, 'entrants' | 'eligiblePersonIds' | 'eligibleStaffIds'>,
  activeSegment: MatchConsoleResponse['segments'][number] | undefined,
): boolean {
  if (!activeSegment || !definition.permittedSegmentTypes.includes(activeSegment.type)) {
    return false;
  }
  if (definition.actorRequirement === 'side') return projection.entrants.length > 0;
  if (definition.actorRequirement === 'person') {
    return projection.entrants.length > 0 && projection.eligiblePersonIds.length > 0;
  }
  if (definition.actorRequirement === 'person-or-staff') {
    return (
      projection.entrants.length > 0 &&
      (projection.eligiblePersonIds.length > 0 || projection.eligibleStaffIds.length > 0)
    );
  }
  return true;
}

export interface UndecidedSide {
  readonly side: 'home' | 'away';
  readonly source: SideSource;
}

/**
 * The sides still waiting on another match. A source keeps its `winner-of` kind after resolving,
 * so only a source with no positioned entrant is undecided; a legacy match carries no sources and
 * is never awaiting anything.
 */
export function undecidedSidesOf(
  projection: Pick<
    MatchConsoleResponse,
    'homeSource' | 'awaySource' | 'homeEntrantId' | 'awayEntrantId'
  >,
): readonly UndecidedSide[] {
  const sides = [
    { side: 'home', source: projection.homeSource, entrantId: projection.homeEntrantId },
    { side: 'away', source: projection.awaySource, entrantId: projection.awayEntrantId },
  ] as const;
  return sides.flatMap(({ side, source, entrantId }) =>
    source === undefined || source.kind === 'entrant' || entrantId !== undefined
      ? []
      : [{ side, source }],
  );
}

/** "Awaiting the winner of semi-final 2", worded by the same formatter every surface uses. */
export function awaitingSourceText(
  source: SideSource,
  messages: SideSourceMessages,
  finalRound?: number,
): string {
  const text = formatSideSource(source, messages, sourceMatchLabel(source, messages, finalRound));
  return applyTemplate(messages.awaiting, { source: text.long });
}

/** Persons a `red-card` event was recorded against — greyed out, not selectable. */
export function sentOffPersonIds(events: readonly ConsoleMatchEvent[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.definitionCode === 'red-card' && event.personId !== undefined) {
      ids.add(event.personId);
    }
  }
  return ids;
}

/**
 * The unique roster member across both entrants whose jersey `number`
 * matches the given digits — `undefined` when nobody matches or, since
 * jersey numbers are unique per team but not across a match, more than one
 * player shares the same number and a keypad shortcut can't disambiguate.
 */
export function memberByNumber(
  rosters: readonly ConsoleRoster[],
  digits: string,
): { readonly entrantId: string; readonly member: ConsoleRosterMember } | undefined {
  if (digits === '') return undefined;
  const matches = rosters.flatMap((roster) =>
    roster.members
      .filter((member) => member.number !== undefined && String(member.number) === digits)
      .map((member) => ({ entrantId: roster.entrantId, member })),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
