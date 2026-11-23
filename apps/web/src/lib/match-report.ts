import type { PublicMatchReportResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { championshipMatch, type BracketMatch } from './bracket.ts';
import { competitionContext, type CompetitionContextLabels } from './competition-context.ts';
import { descriptorLabel, humanizeCode } from './descriptor-label.ts';
import type { LiveMatchClock, LiveSegment } from './live-state.js';
import { applyTemplate, type MatchCardData } from './matches-view.ts';
import {
  formatPlacement,
  formatSideSource,
  sourceMatchLabel,
  type SideSourceMessages,
} from './side-source.ts';

export interface MatchReportTimelineEvent {
  readonly eventId: string;
  readonly label: string;
  readonly occurredAt: string;
  readonly segmentNumber?: number;
  readonly actor?: string;
}

export interface MatchReportTimelineGroup {
  readonly kind: 'single' | 'workflow';
  readonly events: readonly MatchReportTimelineEvent[];
}

export type MatchReportRosterMember = PublicMatchReportResponse['rosters']['home'][number] & {
  /** The member's roles in the page language, parallel to `roles`; never a raw code. */
  readonly roleLabels: readonly string[];
};

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
  readonly home: {
    readonly entrantId?: string;
    readonly name: string;
    readonly abbreviation?: string;
    readonly score?: number;
    readonly roster: readonly MatchReportRosterMember[];
  };
  readonly away: {
    readonly entrantId?: string;
    readonly name: string;
    readonly abbreviation?: string;
    readonly score?: number;
    readonly roster: readonly MatchReportRosterMember[];
  };
  readonly scheduledAt?: string;
  readonly venueName?: string;
  readonly schedulePublished: boolean;
  readonly officials: readonly MatchReportOfficial[];
  readonly timeline: readonly MatchReportTimelineGroup[];
  readonly segments?: readonly LiveSegment[];
  readonly clock?: LiveMatchClock;
}

const OPTIONAL_REPORT_FIELDS = [
  'stageName',
  'zoneName',
  'groupName',
  'nodeKey',
  'branch',
  'winnerEntrantId',
] as const;

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

function buildReportTimeline(
  rows: PublicMatchReportResponse['timeline'],
  actors: ReadonlyMap<string, string>,
  locale: string,
  hiddenPersonLabel: string,
): readonly MatchReportTimelineGroup[] {
  const timeline: MatchReportTimelineGroup[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const event = rows[index];
    const next = rows[index + 1];
    const eventView = timelineEvent(event, actors, locale, hiddenPersonLabel);
    if (next && event.workflowOutcomeCodes?.includes(next.definitionCode)) {
      timeline.push({
        kind: 'workflow',
        events: [eventView, timelineEvent(next, actors, locale, hiddenPersonLabel)],
      });
      index += 1;
    } else {
      timeline.push({ kind: 'single', events: [eventView] });
    }
  }
  return timeline;
}

function buildReportSide(input: {
  readonly entrantId: string | undefined;
  readonly hiddenAtRequest: boolean | undefined;
  readonly name: string | undefined;
  readonly abbreviation: string | undefined;
  readonly score: number | undefined;
  readonly source: PublicMatchReportResponse['homeSource'];
  readonly roster: PublicMatchReportResponse['rosters']['home'];
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
    score: input.score,
    roster: input.roster.map(input.withRoleLabels),
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
  const timeline = buildReportTimeline(response.timeline, actors, locale, hiddenPersonLabel);
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
      score: response.homeScore,
      source: response.homeSource,
      roster: response.rosters.home,
      options,
      hiddenPersonLabel,
      withRoleLabels,
    }),
    away: buildReportSide({
      entrantId: response.awayEntrantId,
      hiddenAtRequest: response.awayHiddenAtRequest,
      name: response.awayName,
      abbreviation: response.awayAbbreviation,
      score: response.awayScore,
      source: response.awaySource,
      roster: response.rosters.away,
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
  };
}

function timelineEvent(
  event: PublicMatchReportResponse['timeline'][number],
  actors: ReadonlyMap<string, string>,
  locale: string,
  hiddenPersonLabel: string,
): MatchReportTimelineEvent {
  return {
    eventId: event.eventId,
    label: descriptorLabel(event.labels ?? event.label, locale, event.definitionCode),
    occurredAt: event.occurredAt,
    ...(event.segmentNumber === undefined ? {} : { segmentNumber: event.segmentNumber }),
    ...(event.hiddenAtRequest
      ? { actor: hiddenPersonLabel }
      : event.personId === undefined || !actors.has(event.personId)
        ? {}
        : { actor: actors.get(event.personId) }),
  };
}

export interface MatchStakeLabels {
  readonly context: CompetitionContextLabels;
  readonly stakeWinner: string;
  readonly stakeLoser: string;
  readonly stakePlace: string;
  readonly stakeChampion: string;
  readonly fallbackChampionScope?: string;
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
  };
  readonly bracketMatches: readonly BracketMatch[];
  readonly stageMatches?: readonly Pick<MatchCardData, 'matchNumber' | 'scheduledAt'>[];
  readonly labels: MatchStakeLabels;
  readonly formatDate?: (scheduledAt: string) => string;
}

function slotReferencesMatch(
  slot: BracketMatch['slots'][number],
  currentNodeKey: string | undefined,
  currentMatchId: string | undefined,
  currentMatchNumber: number,
): boolean {
  if (slot.kind !== 'winner-of' && slot.kind !== 'loser-of') return false;
  if (slot.nodeKey !== undefined && currentNodeKey !== undefined) {
    return slot.nodeKey === currentNodeKey;
  }
  if (slot.matchId !== undefined && currentMatchId !== undefined) {
    return slot.matchId === currentMatchId;
  }
  return slot.matchNumber !== undefined && slot.matchNumber === currentMatchNumber;
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
      if (
        (slot.kind === 'winner-of' || slot.kind === 'loser-of') &&
        slotReferencesMatch(slot, currentNodeKey, currentMatchId, currentMatchNumber)
      ) {
        edges.push({ kind: slot.kind, target });
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
    const place = formatPlacement({ from: Number(singlePlace[1]) }, labels.context.sideSource);
    lines.push(applyTemplate(labels.stakePlace, { place }));
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
