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
import { resolveLabel, type SupportedLanguage } from '@copalibre/domain';
import type {
  ConsoleEventDefinition,
  ConsoleMatchEvent,
  ConsoleRoster,
  ConsoleRosterMember,
  ConsoleSegment,
  ConsoleSegmentPlan,
  MatchConsoleResponse,
  SegmentClockCommand,
} from './api-client.js';

export function newIdempotencyKey(): string {
  return uuidv7();
}

/**
 * The idempotency key of an Add segment: one per match, projection version and type. Taps
 * repeated before the console shows the added segment carry the same key, so the server creates
 * one segment; with no projection loaded yet every tap is its own request.
 */
export function segmentAddKey(
  matchId: string,
  projectionVersion: number | undefined,
  type: string,
): string {
  return projectionVersion === undefined
    ? newIdempotencyKey()
    : `segment-add:${matchId}:${projectionVersion}:${type}`;
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

/**
 * Where a segment stands on its own clock, as the operator reads it. A stopped segment with time
 * above zero is paused: the server stores it as pending, which alone does not tell a half that
 * never ran from one that was stopped part-way.
 */
export type SegmentPhase = 'not-started' | 'paused' | 'running' | 'ended';

export function segmentPhaseOf(
  segment: Pick<ConsoleSegment, 'state' | 'elapsedSeconds'>,
): SegmentPhase {
  if (segment.state === 'active') return 'running';
  if (segment.state === 'completed') return 'ended';
  return segment.elapsedSeconds > 0 ? 'paused' : 'not-started';
}

/**
 * A clock button, named for what it does to the segment. Start segment and Resume send the same
 * server command; the labels differ so the operator reads whether a fresh segment starts or the
 * stopped one continues.
 */
export type ClockAction =
  'start-match' | 'start-segment' | 'resume' | 'pause' | 'end-segment' | 'reopen-segment';

export interface ClockActions {
  /** Only the actions the match and the selected segment allow, primary first. */
  readonly actions: readonly {
    readonly action: ClockAction;
    readonly primary: boolean;
  }[];
  /** Whether Finalize is the one primary action: nothing is left to run. */
  readonly finalizePrimary: boolean;
  /** The running segment, when another segment holds the clock and so blocks starting this one. */
  readonly runningSegment?: ConsoleSegment;
}

/** The server command a clock action sends. Reopen has its own endpoint and no command. */
export function commandOfClockAction(
  action: Exclude<ClockAction, 'reopen-segment'>,
): SegmentClockCommand {
  switch (action) {
    case 'start-match':
      return 'start';
    case 'start-segment':
    case 'resume':
      return 'resume';
    case 'pause':
      return 'pause';
    case 'end-segment':
      return 'end';
  }
}

/**
 * What the clock card and the finalize card offer for the selected segment, one set per state.
 * The match status and the segment's phase decide it. Start segment and Resume are withheld while
 * another segment runs, and the running one is named instead: the console never starts a second
 * clock by accident. A finalized match offers no clock action.
 */
export function clockActionsOf(
  status: MatchConsoleResponse['status'],
  segments: readonly ConsoleSegment[],
  selected: ConsoleSegment | undefined,
  regulation?: ConsoleSegmentPlan['regulation'],
): ClockActions {
  const finalizePrimary =
    status === 'in-progress' && segments.every((segment) => segment.state === 'completed');
  const none: ClockActions = { actions: [], finalizePrimary };
  // A scheduled match with no segments has nothing selected yet: Start creates its regulation.
  if (status === 'scheduled' && segments.length === 0) {
    return regulation === undefined
      ? none
      : { actions: [{ action: 'start-match', primary: true }], finalizePrimary };
  }
  if (selected === undefined) return none;
  if (status === 'scheduled') {
    return { actions: [{ action: 'start-match', primary: true }], finalizePrimary };
  }
  if (status !== 'in-progress') return none;
  const phase = segmentPhaseOf(selected);
  // Starting or resuming a segment never runs beside another running one: the running one is named.
  const runningSegment = segments.find((segment) => segment.state === 'active');
  const blockedByRunning = runningSegment !== undefined && phase !== 'running';

  switch (phase) {
    case 'running':
      return {
        actions: [
          { action: 'pause', primary: true },
          { action: 'end-segment', primary: false },
        ],
        finalizePrimary,
      };
    case 'ended':
      // Reopening corrects the record, so it is never the primary action: Finalize stays primary.
      return { actions: [{ action: 'reopen-segment', primary: false }], finalizePrimary };
    case 'paused':
    case 'not-started': {
      if (blockedByRunning) return { actions: [], finalizePrimary, runningSegment };
      if (phase === 'not-started') {
        return { actions: [{ action: 'start-segment', primary: true }], finalizePrimary };
      }
      return {
        actions: [
          { action: 'resume', primary: true },
          { action: 'end-segment', primary: false },
        ],
        finalizePrimary,
      };
    }
  }
}

/**
 * The Add segment choices: every declared type, labelled in the operator's language, with the
 * outside-plan suffix on the ones that would go beyond the plan.
 */
export function addSegmentOptionsOf(
  projection: Pick<MatchConsoleResponse, 'segmentPlan'>,
  language: SupportedLanguage,
  outsidePlanSuffix: string,
): readonly { readonly value: string; readonly label: string }[] {
  return projection.segmentPlan.addable.map((entry) => {
    const name = resolveLabel(entry.typeLabel ?? entry.type, language);
    return {
      value: entry.type,
      label: entry.withinPlan ? name : `${name} ${outsidePlanSuffix}`,
    };
  });
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

/** What the operator typed into the time correction field, and for which segment. */
export interface ClockTimeDraft {
  readonly segmentId: string;
  readonly value: string;
}

/** The typed time while the draft belongs to the selected segment, else undefined. */
export function typedClockTimeOf(
  draft: ClockTimeDraft | undefined,
  selectedSegmentId: string,
): string | undefined {
  return draft?.segmentId === selectedSegmentId ? draft.value : undefined;
}

/** The time field text: what was typed, else the selected segment's current time as mm:ss. */
export function clockTimeInputOf(
  selected: ConsoleSegment | undefined,
  typed: string | undefined,
): string {
  if (typed !== undefined) return typed;
  return selected === undefined ? '' : formatClock(selected.elapsedSeconds);
}

const MINUTES_AND_SECONDS = /^(\d{1,3}):(\d{2})$/;
const WHOLE_MINUTES = /^\d{1,3}$/;

/**
 * Whole seconds from the operator's time, written as minutes:seconds (`20:50`, `0:05`) or as whole
 * minutes (`45`). Undefined for anything else: empty text, a sign, a fraction, seconds of 60 or
 * more, or extra characters. Correct time is unavailable for every undefined result.
 */
export function parseClockTime(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const value = text.trim();
  const clock = MINUTES_AND_SECONDS.exec(value);
  if (clock) {
    const seconds = Number(clock[2]);
    return seconds < 60 ? Number(clock[1]) * 60 + seconds : undefined;
  }
  return WHOLE_MINUTES.test(value) ? Number(value) * 60 : undefined;
}

/** The longest reopen reason the server accepts, counted after trimming. */
export const REOPEN_REASON_MAX_LENGTH = 500;

/** Whether a reopen reason can be sent: non-empty and within the server's limit once trimmed. */
export function reopenReasonValidOf(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed !== '' && trimmed.length <= REOPEN_REASON_MAX_LENGTH;
}

/**
 * The segment a reopen confirmation still applies to: the one it was opened for, while that
 * segment is the selected one and has ended. Any other state closes the confirmation.
 */
export function reopenTargetOf(
  segments: readonly ConsoleSegment[],
  openedFor: string | undefined,
  selectedSegmentId: string,
): ConsoleSegment | undefined {
  if (openedFor === undefined || openedFor !== selectedSegmentId) return undefined;
  return segments.find(
    (segment) => segment.segmentId === openedFor && segment.state === 'completed',
  );
}

/**
 * Whether a match's clock may still be corrected or driven: only a scheduled or an in-progress
 * match. A finalized, forfeited or anulled match is closed, and offers no clock action.
 */
export function clockOpenOf(status: string): boolean {
  return status === 'scheduled' || status === 'in-progress';
}
