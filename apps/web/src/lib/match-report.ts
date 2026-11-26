import type { PublicMatchReportResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import type { LocalizedLabel } from '@copalibre/domain';
import { championshipMatch, type BracketMatch } from './bracket.ts';
import { competitionContext, type CompetitionContextLabels } from './competition-context.ts';
import { descriptorLabel, humanizeCode } from './descriptor-label.ts';
import type { LiveMatchClock, LiveMatchCounter, LiveSegment } from './live-state.js';
import { applyTemplate, type MatchCardData } from './matches-view.ts';
import { localizedText } from './localized-label.ts';
import { clubEmblemUrl } from './public-image-paths.ts';
import {
  formatOverallPlaceFromTemplate,
  formatPlacement,
  formatSideSource,
  sourceMatchLabel,
  type SideSourceMessages,
} from './side-source.ts';

export type MatchReportSide = 'home' | 'away';

export interface MatchReportTimelineEvent {
  readonly eventId: string;
  readonly label: string;
  readonly occurredAt: string;
  readonly segmentNumber?: number;
  /** The segment's name in the page language, e.g. "Tiempo". */
  readonly segmentLabel?: string;
  /** Seconds into the segment when recorded; absent for an untimed segment or an older event. */
  readonly elapsedSeconds?: number;
  readonly actor?: string;
  /** The side the event belongs to, from the side's entrant id; absent when no side is recorded. */
  readonly side?: MatchReportSide;
  /** The score after this event, on every event that changes it. */
  readonly scoreAfter?: readonly [number, number];
}

export interface MatchReportSegmentMarker {
  readonly number: number;
  readonly label: string;
  /** Present on the end marker of a completed segment: the segment's own score, [home, away]. */
  readonly scores?: readonly [number, number];
}

export interface MatchReportTimelineGroup {
  readonly kind: 'single' | 'workflow' | 'segment-start' | 'segment-end';
  readonly events: readonly MatchReportTimelineEvent[];
  /** Set only on `segment-start` and `segment-end` markers. */
  readonly segment?: MatchReportSegmentMarker;
}

export type MatchReportRosterMember = PublicMatchReportResponse['rosters']['home'][number] & {
  /** The member's roles in the page language, parallel to `roles`; never a raw code. */
  readonly roleLabels: readonly string[];
};

/** A registered player before a match-day roster is recorded: no shirt number and no role yet. */
export type MatchReportRegisteredSquad = readonly MatchReportRosterMember[];

export interface MatchReportOfficial {
  readonly name: string;
  readonly roleLabels: readonly string[];
}

export interface MatchReportOptions {
  /** The page language the descriptor's labels are resolved in. Defaults to English. */
  readonly locale?: string;
  /** Names a platform official role (`referee`, `assistant`, …) in the page language. */
  readonly officialRoleLabel?: (code: string) => string;
  /** Localized label for a person who opted out of public identification. */
  readonly hiddenPersonLabel?: string;
  /** Words an undecided side by its source; without it the side reads as an unknown entrant. */
  readonly sideSource: SideSourceMessages;
  /** The stage's single-elimination depth, so a source names "Semi-final 2" as every surface does. */
  readonly sourceFinalRound?: number;
  /** Zone-scoped sibling node keys for formatting `PL*` placement feeders. */
  readonly zoneNodeKeys?: readonly (string | undefined)[];
  /** The word for a segment whose descriptor gives no label, in the page language. */
  readonly genericSegmentLabel?: string;
}

export interface MatchReportSideModel {
  readonly entrantId?: string;
  readonly name: string;
  readonly abbreviation?: string;
  readonly clubAlias?: string;
  /** The club's crest, when the club has one. */
  readonly crestSrc?: string;
  readonly score?: number;
  readonly roster: readonly MatchReportRosterMember[];
  /** The registered players, shown in place of the roster until one is recorded. */
  readonly registeredSquad?: MatchReportRegisteredSquad;
}

export interface MatchReportModel {
  readonly rescheduledFrom?: PublicMatchReportResponse['rescheduledFrom'];
  readonly organizationName: string;
  readonly tournamentName: string;
  readonly stageNumber: number;
  readonly stageName?: string;
  readonly zoneName?: string;
  readonly groupName?: string;
  readonly nodeKey?: string;
  readonly branch?: string;
  readonly matchNumber: number;
  readonly round: number;
  readonly status: 'upcoming' | 'live' | 'final';
  readonly winnerEntrantId?: string;
  readonly home: MatchReportSideModel;
  readonly away: MatchReportSideModel;
  readonly scheduledAt?: string;
  readonly venueName?: string;
  readonly schedulePublished: boolean;
  readonly officials: readonly MatchReportOfficial[];
  readonly timeline: readonly MatchReportTimelineGroup[];
  readonly segments?: readonly LiveSegment[];
  readonly clock?: LiveMatchClock;
  /** Declared match counters; absent when the discipline declares none. */
  readonly counters?: readonly LiveMatchCounter[];
  /** The match's id: its page follows the match stream. */
  readonly matchId?: string;
  /** The link the match is watched through, when the organizer attached one. */
  readonly streamUrl?: string;
  /** The page follows the match stream: a counter or a timed penalty is shown. */
  readonly tracksLiveIndicators?: boolean;
  /** Timed penalties in force while the match is live. */
  readonly activePenalties?: readonly {
    readonly timerId: string;
    readonly entrantId: string;
    readonly remainingSeconds: number;
  }[];
}

const OPTIONAL_REPORT_FIELDS = [
  'stageName',
  'zoneName',
  'groupName',
  'nodeKey',
  'branch',
  'winnerEntrantId',
] as const;

/**
 * Orders a roster or registered squad by shirt number, numbers compared as numbers ("9" before "10").
 * A member without a number follows them, ordered by name. Both comparisons use the page locale's
 * collation.
 */
export function sortRosterMembers<
  T extends { readonly number?: number | string; readonly name?: string },
>(members: readonly T[], locale: string): T[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  return [...members].sort((a, b) => {
    if (a.number !== undefined && b.number !== undefined) {
      const byNumber = collator.compare(String(a.number), String(b.number));
      if (byNumber !== 0) return byNumber;
      return collator.compare(a.name ?? '', b.name ?? '');
    }
    if (a.number !== undefined) return -1;
    if (b.number !== undefined) return 1;
    return collator.compare(a.name ?? '', b.name ?? '');
  });
}

/** Minutes and seconds of an elapsed segment time: 480 becomes "08:00", 4500 becomes "75:00". */
export function formatElapsed(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildActorMap(rosters: PublicMatchReportResponse['rosters']): ReadonlyMap<string, string> {
  const actors = new Map<string, string>();
  for (const member of [...rosters.home, ...rosters.away]) {
    if (
      member.personId === undefined ||
      member.hiddenAtRequest === true ||
      member.name === undefined
    ) {
      continue;
    }
    actors.set(
      member.personId,
      member.number === undefined ? member.name : `#${member.number} ${member.name}`,
    );
  }
  return actors;
}

interface TimelineContext {
  readonly actors: ReadonlyMap<string, string>;
  readonly locale: string;
  readonly hiddenPersonLabel: string;
  readonly homeEntrantId: string | undefined;
  readonly awayEntrantId: string | undefined;
  readonly segments: ReadonlyMap<number, PublicSegmentSummary>;
  readonly genericSegmentLabel: string;
}

type PublicSegmentSummary = NonNullable<PublicMatchReportResponse['segments']>[number];
type RegisteredSquadMember = NonNullable<
  NonNullable<PublicMatchReportResponse['registeredSquads']>['home']
>[number];

/**
 * The timeline, in match order. Every segment of the match opens with a start marker, whether or not it
 * has events, and a completed segment closes with an end marker that carries its own score. An in-progress
 * segment has only its start marker. An event without a segment number does not open or close anything: it
 * stays where its sequence puts it, inside whichever segment is open.
 */
function buildReportTimeline(
  rows: PublicMatchReportResponse['timeline'],
  context: TimelineContext,
): readonly MatchReportTimelineGroup[] {
  const groups: {
    readonly kind: MatchReportTimelineGroup['kind'];
    readonly events: MatchReportTimelineEvent[];
  }[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const event = rows[index];
    const next = rows[index + 1];
    const eventView = timelineEvent(event, context);
    if (next && event.workflowOutcomeCodes?.includes(next.definitionCode)) {
      groups.push({ kind: 'workflow', events: [eventView, timelineEvent(next, context)] });
      index += 1;
    } else {
      groups.push({ kind: 'single', events: [eventView] });
    }
  }

  const segments = [...context.segments.values()].sort((a, b) => a.number - b.number);
  const timeline: MatchReportTimelineGroup[] = [];
  let cursor = 0;
  let open: PublicSegmentSummary | undefined;
  const closeOpen = () => {
    if (open !== undefined && open.state === 'completed' && open.scores !== undefined) {
      timeline.push({
        kind: 'segment-end',
        events: [],
        segment: {
          number: open.number,
          label: segmentLabelOf(open, context),
          scores: [open.scores[0] ?? 0, open.scores[1] ?? 0],
        },
      });
    }
    open = undefined;
  };
  // Opens every segment up to `number` in order, each with its start marker, and closes the one before.
  // Without a number it opens the rest, so a trailing segment without events is still marked.
  const openThrough = (number: number | undefined) => {
    while (
      cursor < segments.length &&
      (number === undefined || (segments[cursor]?.number ?? 0) <= number)
    ) {
      closeOpen();
      const segment = segments[cursor];
      cursor += 1;
      if (segment === undefined) break;
      open = segment;
      timeline.push({
        kind: 'segment-start',
        events: [],
        segment: { number: segment.number, label: segmentLabelOf(segment, context) },
      });
    }
  };

  for (const group of groups) {
    const segmentNumber = group.events[0]?.segmentNumber;
    if (segmentNumber !== undefined) openThrough(segmentNumber);
    timeline.push({ kind: group.kind, events: group.events });
  }
  openThrough(undefined);
  closeOpen();
  return timeline;
}

/**
 * A segment's name in the page language: the descriptor's own label for its type, or the generic segment
 * word when the descriptor gives none. The type's code is never shown.
 */
function segmentLabelOf(summary: PublicSegmentSummary, context: TimelineContext): string {
  return summary.label === undefined
    ? context.genericSegmentLabel
    : localizedText(summary.label as string | LocalizedLabel, context.locale);
}

function buildReportSide(input: {
  readonly entrantId: string | undefined;
  readonly hiddenAtRequest: boolean | undefined;
  readonly name: string | undefined;
  readonly abbreviation: string | undefined;
  readonly clubAlias: string | undefined;
  readonly score: number | undefined;
  readonly source: PublicMatchReportResponse['homeSource'];
  readonly roster: PublicMatchReportResponse['rosters']['home'];
  readonly registeredSquad: MatchReportRegisteredSquad | undefined;
  readonly crestSrc: string | undefined;
  readonly options: MatchReportOptions;
  readonly hiddenPersonLabel: string;
  readonly withRoleLabels: (
    member: PublicMatchReportResponse['rosters']['home'][number],
  ) => MatchReportRosterMember;
}): MatchReportModel['home'] {
  const sideName = formatSideSource(
    input.source,
    input.options.sideSource,
    input.source === undefined
      ? undefined
      : sourceMatchLabel(
          input.source,
          input.options.sideSource,
          input.options.sourceFinalRound,
          input.options.zoneNodeKeys,
        ),
  ).long;
  return {
    ...(input.entrantId === undefined ? {} : { entrantId: input.entrantId }),
    name: input.hiddenAtRequest ? input.hiddenPersonLabel : (input.name ?? sideName),
    abbreviation: input.abbreviation,
    ...(input.hiddenAtRequest || input.clubAlias === undefined
      ? {}
      : { clubAlias: input.clubAlias }),
    score: input.score,
    ...(input.crestSrc === undefined ? {} : { crestSrc: input.crestSrc }),
    roster: sortRosterMembers(input.roster.map(input.withRoleLabels), input.options.locale ?? 'en'),
    // A recorded match-day roster replaces the registered squad, so the squad only shows while the side has none.
    ...(input.registeredSquad === undefined || input.roster.length > 0
      ? {}
      : {
          registeredSquad: sortRosterMembers(input.registeredSquad, input.options.locale ?? 'en'),
        }),
  };
}

/**
 * Shapes a flat public projection for its server-rendered page. Workflow
 * relationships stay descriptor-derived presentation data; event rows remain
 * independent facts with no stored event-to-event linkage.
 */
export function buildMatchReport(
  response: PublicMatchReportResponse,
  options: MatchReportOptions,
): MatchReportModel {
  const locale = options.locale ?? 'en';
  const hiddenPersonLabel = options.hiddenPersonLabel ?? 'Player hidden at their request';
  const officialRoleLabel = options.officialRoleLabel ?? humanizeCode;
  const roleDeclarations = new Map(
    (response.rosterRoles ?? []).map((role) => [role.code, role.label]),
  );
  const withRoleLabels = (
    member: PublicMatchReportResponse['rosters']['home'][number],
  ): MatchReportRosterMember => ({
    ...member,
    ...(member.hiddenAtRequest ? { name: hiddenPersonLabel } : {}),
    roleLabels: (member.roles ?? []).map((code) =>
      descriptorLabel(roleDeclarations.get(code), locale, code),
    ),
  });

  const actors = buildActorMap(response.rosters);
  const timeline = buildReportTimeline(response.timeline, {
    actors,
    locale,
    hiddenPersonLabel,
    homeEntrantId: response.homeEntrantId,
    awayEntrantId: response.awayEntrantId,
    segments: new Map((response.segments ?? []).map((segment) => [segment.number, segment])),
    genericSegmentLabel: options.genericSegmentLabel ?? 'Segment',
  });
  const optional: Record<string, unknown> = {};
  for (const field of OPTIONAL_REPORT_FIELDS) {
    if (response[field] !== undefined) optional[field] = response[field];
  }

  return {
    rescheduledFrom: response.rescheduledFrom,
    organizationName: response.organizationName,
    tournamentName: response.tournamentName,
    stageNumber: response.stageNumber,
    ...(optional as Partial<MatchReportModel>),
    matchNumber: response.matchNumber,
    round: response.round,
    status: response.status,
    home: buildReportSide({
      entrantId: response.homeEntrantId,
      hiddenAtRequest: response.homeHiddenAtRequest,
      name: response.homeName,
      abbreviation: response.homeAbbreviation,
      clubAlias: response.homeClubAlias,
      score: response.homeScore,
      source: response.homeSource,
      roster: response.rosters.home,
      registeredSquad: registeredSquadOf(response.registeredSquads?.home, hiddenPersonLabel),
      crestSrc: crestOf(
        response.organizationAlias,
        response.homeClubId,
        response.homeEmblemObjectId,
      ),
      options,
      hiddenPersonLabel,
      withRoleLabels,
    }),
    away: buildReportSide({
      entrantId: response.awayEntrantId,
      hiddenAtRequest: response.awayHiddenAtRequest,
      name: response.awayName,
      abbreviation: response.awayAbbreviation,
      clubAlias: response.awayClubAlias,
      score: response.awayScore,
      source: response.awaySource,
      roster: response.rosters.away,
      registeredSquad: registeredSquadOf(response.registeredSquads?.away, hiddenPersonLabel),
      crestSrc: crestOf(
        response.organizationAlias,
        response.awayClubId,
        response.awayEmblemObjectId,
      ),
      options,
      hiddenPersonLabel,
      withRoleLabels,
    }),
    scheduledAt: response.scheduledAt,
    venueName: response.venueName,
    schedulePublished: response.schedulePublished,
    officials: response.officials.map((official) => ({
      name: official.name,
      roleLabels: official.roles.map(officialRoleLabel),
    })),
    timeline,
    ...(response.segments === undefined || response.segments.length === 0
      ? {}
      : { segments: response.segments as readonly LiveSegment[] }),
    ...(response.clock === undefined ? {} : { clock: response.clock }),
    ...(response.matchId === undefined ? {} : { matchId: response.matchId }),
    ...(response.streamUrl === undefined ? {} : { streamUrl: response.streamUrl }),
    ...(response.tracksLiveIndicators === true ? { tracksLiveIndicators: true } : {}),
    ...(response.counters === undefined
      ? {}
      : { counters: response.counters as readonly LiveMatchCounter[] }),
    ...(response.activePenalties === undefined || response.activePenalties.length === 0
      ? {}
      : { activePenalties: response.activePenalties }),
  };
}

function timelineEvent(
  event: PublicMatchReportResponse['timeline'][number],
  context: TimelineContext,
): MatchReportTimelineEvent {
  const { actors, locale, hiddenPersonLabel, homeEntrantId, awayEntrantId, segments } = context;
  const segment = event.segmentNumber === undefined ? undefined : segments.get(event.segmentNumber);
  const side: MatchReportSide | undefined =
    event.side === undefined
      ? undefined
      : event.side === homeEntrantId
        ? 'home'
        : event.side === awayEntrantId
          ? 'away'
          : undefined;
  return {
    eventId: event.eventId,
    label: descriptorLabel(event.labels ?? event.label, locale, event.definitionCode),
    occurredAt: event.occurredAt,
    ...(event.segmentNumber === undefined ? {} : { segmentNumber: event.segmentNumber }),
    ...(event.segmentNumber === undefined
      ? {}
      : {
          segmentLabel:
            segment === undefined ? context.genericSegmentLabel : segmentLabelOf(segment, context),
        }),
    ...(event.segmentElapsedSeconds === undefined
      ? {}
      : { elapsedSeconds: event.segmentElapsedSeconds }),
    ...(side === undefined ? {} : { side }),
    ...(event.scoreAfter === undefined
      ? {}
      : { scoreAfter: [event.scoreAfter[0], event.scoreAfter[1]] as const }),
    ...(event.hiddenAtRequest
      ? { actor: hiddenPersonLabel }
      : event.personId === undefined || !actors.has(event.personId)
        ? {}
        : { actor: actors.get(event.personId) }),
  };
}

/** A registered squad member, shaped as a roster member: no shirt number, no role, not on the field. */
function registeredSquadOf(
  members: readonly RegisteredSquadMember[] | undefined,
  hiddenPersonLabel: string,
): MatchReportRegisteredSquad | undefined {
  if (members === undefined || members.length === 0) return undefined;
  return members.map((member) => ({
    ...member,
    ...(member.hiddenAtRequest ? { name: hiddenPersonLabel } : {}),
    roleLabels: [],
    onField: false,
  }));
}

function crestOf(
  organizationAlias: string,
  clubId: string | undefined,
  emblemObjectId: string | undefined,
): string | undefined {
  return clubId === undefined || emblemObjectId === undefined
    ? undefined
    : clubEmblemUrl(organizationAlias, clubId);
}

export interface MatchStakeLabels {
  readonly context: CompetitionContextLabels;
  readonly stakeWinner: string;
  readonly stakeLoser: string;
  readonly stakePlace: string;
  readonly stakeChampion: string;
  readonly fallbackChampionScope?: string;
  readonly formatOverallPlace?: (place: number) => string;
}

export interface MatchStakeInput {
  readonly currentMatch: {
    readonly nodeKey?: string;
    readonly matchId?: string;
    readonly matchNumber: number;
    readonly stageNumber: number;
    readonly stageName?: string;
    readonly zoneName?: string;
    readonly round?: number;
    readonly sourceFinalRound?: number;
    readonly overallPlaceOffset?: number;
  };
  readonly bracketMatches: readonly BracketMatch[];
  readonly stageMatches?: readonly Pick<MatchCardData, 'matchNumber' | 'scheduledAt'>[];
  readonly labels: MatchStakeLabels;
  readonly formatDate?: (scheduledAt: string) => string;
}

function matchesCurrentMatch(
  slot: Extract<BracketMatch['slots'][number], { kind: 'winner-of' | 'loser-of' }>,
  currentNodeKey: string | undefined,
  currentMatchId: string | undefined,
  currentMatchNumber: number,
): boolean {
  if (slot.nodeKey !== undefined && currentNodeKey !== undefined) {
    return slot.nodeKey === currentNodeKey;
  }
  if (slot.matchId !== undefined && currentMatchId !== undefined) {
    return slot.matchId === currentMatchId;
  }
  return slot.matchNumber === currentMatchNumber;
}

function outgoingSlotKind(
  slot: BracketMatch['slots'][number],
  currentNodeKey: string | undefined,
  currentMatchId: string | undefined,
  currentMatchNumber: number,
): 'winner-of' | 'loser-of' | undefined {
  if (slot.kind === 'entrant') {
    if (slot.from === undefined || currentMatchId === undefined) return undefined;
    if (slot.from.matchId !== currentMatchId) return undefined;
    return slot.from.outcome === 'winner' ? 'winner-of' : 'loser-of';
  }
  if (slot.kind !== 'winner-of' && slot.kind !== 'loser-of') return undefined;
  return matchesCurrentMatch(slot, currentNodeKey, currentMatchId, currentMatchNumber)
    ? slot.kind
    : undefined;
}

interface OutgoingStakeEdge {
  readonly kind: 'winner-of' | 'loser-of';
  readonly target: BracketMatch;
}

function collectOutgoingStakeEdges(
  bracketMatches: readonly BracketMatch[],
  currentNodeKey: string | undefined,
  currentMatchId: string | undefined,
  currentMatchNumber: number,
): readonly OutgoingStakeEdge[] {
  const edges: OutgoingStakeEdge[] = [];
  for (const target of bracketMatches) {
    for (const slot of target.slots) {
      const kind = outgoingSlotKind(slot, currentNodeKey, currentMatchId, currentMatchNumber);
      if (kind !== undefined) {
        edges.push({ kind, target });
      }
    }
  }
  edges.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'winner-of' ? -1 : 1));
  return edges;
}

function formatOutgoingStakeLine(
  edge: OutgoingStakeEdge,
  input: MatchStakeInput,
  zoneNodeKeys: readonly (string | undefined)[],
  finalRound: number | undefined,
): string {
  const { currentMatch, stageMatches, labels, formatDate } = input;
  const ctx = competitionContext(
    {
      stageNumber: currentMatch.stageNumber,
      stageName: currentMatch.stageName,
      zoneName: currentMatch.zoneName,
      round: edge.target.roundNumber,
      matchNumber: edge.target.matchNumber,
      nodeKey: edge.target.nodeKey,
      sourceFinalRound: edge.target.sourceFinalRound ?? finalRound,
      zoneNodeKeys,
    },
    labels.context,
  );
  const targetName = [ctx.zone, ctx.group, ctx.round].filter(Boolean).join(' · ') || ctx.line;
  const scheduledAt = stageMatches?.find(
    (m) => m.matchNumber === edge.target.matchNumber,
  )?.scheduledAt;
  const when =
    scheduledAt !== undefined && formatDate !== undefined ? `, ${formatDate(scheduledAt)}` : '';
  return applyTemplate(edge.kind === 'winner-of' ? labels.stakeWinner : labels.stakeLoser, {
    match: targetName,
    when,
  });
}

function isChampionshipStakeMatch(
  currentMatch: MatchStakeInput['currentMatch'],
  currentNodeKey: string | undefined,
  currentNode: BracketMatch | undefined,
  bracketMatches: readonly BracketMatch[],
  finalRound: number | undefined,
  edges: readonly OutgoingStakeEdge[],
): boolean {
  const round = currentMatch.round ?? currentNode?.roundNumber;
  if (
    currentNodeKey?.startsWith('SE-') &&
    round !== undefined &&
    finalRound !== undefined &&
    round === finalRound
  ) {
    return true;
  }
  return (
    bracketMatches.length > 0 &&
    championshipMatch(bracketMatches)?.matchNumber === currentMatch.matchNumber &&
    !edges.some((edge) => edge.kind === 'winner-of')
  );
}

/**
 * Derives "what's at stake" statements for a match in a stage graph:
 * outgoing winner/loser feeder targets (with scheduled start when published),
 * settled placement (`placement-{N}`), or zone championship (final).
 * Round-robin matches with no graph node or outgoing edges return an empty array.
 */
export function matchStakeLines(input: MatchStakeInput): readonly string[] {
  const { currentMatch, bracketMatches, labels } = input;
  const currentNode = bracketMatches.find(
    (m) =>
      (currentMatch.nodeKey !== undefined && m.nodeKey === currentMatch.nodeKey) ||
      m.matchNumber === currentMatch.matchNumber,
  );
  const currentNodeKey = currentMatch.nodeKey ?? currentNode?.nodeKey;
  const currentMatchId = currentMatch.matchId ?? currentNode?.matchId;
  const zoneNodeKeys = bracketMatches.map((m) => m.nodeKey);
  const finalRound = currentMatch.sourceFinalRound ?? currentNode?.sourceFinalRound;

  const edges = collectOutgoingStakeEdges(
    bracketMatches,
    currentNodeKey,
    currentMatchId,
    currentMatch.matchNumber,
  );

  const lines: string[] = [];
  const seenTargets = new Set<string>();
  for (const edge of edges) {
    const dedupeKey = `${edge.kind}:${edge.target.matchNumber}:${edge.target.nodeKey ?? ''}`;
    if (seenTargets.has(dedupeKey)) continue;
    seenTargets.add(dedupeKey);
    lines.push(formatOutgoingStakeLine(edge, input, zoneNodeKeys, finalRound));
  }

  const singlePlace = /^(?:placement|place)-(\d+)$/.exec(currentNodeKey ?? '');
  if (singlePlace) {
    const zonePlace = Number(singlePlace[1]);
    const place = formatPlacement({ from: zonePlace }, labels.context.sideSource);
    const overallPlace =
      currentMatch.overallPlaceOffset !== undefined
        ? currentMatch.overallPlaceOffset + zonePlace
        : undefined;
    const overall =
      overallPlace === undefined
        ? undefined
        : labels.formatOverallPlace !== undefined
          ? labels.formatOverallPlace(overallPlace)
          : labels.context.overallPlaceTemplate !== undefined
            ? formatOverallPlaceFromTemplate(
                labels.context.overallPlaceTemplate,
                overallPlace,
                labels.context.sideSource,
              )
            : undefined;
    const combinedPlace = overall === undefined ? place : `${place} · ${overall}`;
    lines.push(applyTemplate(labels.stakePlace, { place: combinedPlace }));
    return lines;
  }

  if (
    isChampionshipStakeMatch(
      currentMatch,
      currentNodeKey,
      currentNode,
      bracketMatches,
      finalRound,
      edges,
    )
  ) {
    const scope =
      currentMatch.zoneName?.trim() ||
      labels.fallbackChampionScope?.trim() ||
      competitionContext(
        { stageNumber: currentMatch.stageNumber, stageName: currentMatch.stageName },
        labels.context,
      ).stage;
    lines.push(applyTemplate(labels.stakeChampion, { zone: scope }));
  }

  return lines;
}
