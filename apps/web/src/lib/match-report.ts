import type { PublicMatchReportResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';

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

export interface MatchReportModel {
  readonly organizationName: string;
  readonly tournamentName: string;
  readonly stageNumber: number;
  readonly matchNumber: number;
  readonly round: number;
  readonly status: 'upcoming' | 'live' | 'final';
  readonly home: {
    readonly name: string;
    readonly abbreviation?: string;
    readonly score?: number;
    readonly roster: PublicMatchReportResponse['rosters']['home'];
  };
  readonly away: {
    readonly name: string;
    readonly abbreviation?: string;
    readonly score?: number;
    readonly roster: PublicMatchReportResponse['rosters']['away'];
  };
  readonly scheduledAt?: string;
  readonly venueName?: string;
  readonly schedulePublished: boolean;
  readonly officials: PublicMatchReportResponse['officials'];
  readonly timeline: readonly MatchReportTimelineGroup[];
}

/**
 * Shapes a flat public projection for its server-rendered page. Workflow
 * relationships stay descriptor-derived presentation data; event rows remain
 * independent facts with no stored event-to-event linkage.
 */
export function buildMatchReport(response: PublicMatchReportResponse): MatchReportModel {
  const actors = new Map(
    [...response.rosters.home, ...response.rosters.away].map((member) => [
      member.personId,
      member.number === undefined ? member.name : `#${member.number} ${member.name}`,
    ]),
  );

  const timeline: MatchReportTimelineGroup[] = [];
  for (let index = 0; index < response.timeline.length; index += 1) {
    const event = response.timeline[index];
    const next = response.timeline[index + 1];
    const eventView = timelineEvent(event, actors);
    if (next && event.workflowOutcomeCodes?.includes(next.definitionCode)) {
      timeline.push({ kind: 'workflow', events: [eventView, timelineEvent(next, actors)] });
      index += 1;
    } else {
      timeline.push({ kind: 'single', events: [eventView] });
    }
  }

  return {
    organizationName: response.organizationName,
    tournamentName: response.tournamentName,
    stageNumber: response.stageNumber,
    matchNumber: response.matchNumber,
    round: response.round,
    status: response.status,
    home: {
      name: response.homeName ?? 'TBD',
      abbreviation: response.homeAbbreviation,
      score: response.homeScore,
      roster: response.rosters.home,
    },
    away: {
      name: response.awayName ?? 'TBD',
      abbreviation: response.awayAbbreviation,
      score: response.awayScore,
      roster: response.rosters.away,
    },
    scheduledAt: response.scheduledAt,
    venueName: response.venueName,
    schedulePublished: response.schedulePublished,
    officials: response.officials,
    timeline,
  };
}

function timelineEvent(
  event: PublicMatchReportResponse['timeline'][number],
  actors: ReadonlyMap<string, string>,
): MatchReportTimelineEvent {
  return {
    eventId: event.eventId,
    label: event.label,
    occurredAt: event.occurredAt,
    ...(event.segmentNumber === undefined ? {} : { segmentNumber: event.segmentNumber }),
    ...(event.personId === undefined || !actors.has(event.personId)
      ? {}
      : { actor: actors.get(event.personId) }),
  };
}
