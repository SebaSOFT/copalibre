import type {
  Entrant,
  EntrantAttribute,
  Match,
  Official,
  ResourceAssignment,
  Venue,
  Organization,
  Participant,
  RecordedEvent,
  Roster,
  Segment,
  Stage,
  Team,
  Tournament,
} from '@copalibre/domain';
import type { Selectable } from 'kysely';
import type {
  EntrantAttributesTable,
  EntrantsTable,
  FixtureSchedulesTable,
  OfficialsTable,
  VenuesTable,
  MatchEventsTable,
  MatchesTable,
  OrganizationsTable,
  ParticipantsTable,
  RostersTable,
  SegmentsTable,
  StagesTable,
  TeamsTable,
  TournamentsTable,
} from './schema.js';

/**
 * camelCase domain ↔ snake_case column mapping, explicit per aggregate. No
 * Kysely naming plugin: the architecture doc puts this mapping in
 * `packages/persistence`, and doing it by hand keeps the boundary auditable.
 *
 * Row types come from Kysely's own `Selectable<T>` (jsonb parsed, timestamps
 * as Date) rather than a hand-rolled equivalent.
 */
export type OrganizationRow = Selectable<OrganizationsTable>;
export type TournamentRow = Selectable<TournamentsTable>;
export type ParticipantRow = Selectable<ParticipantsTable>;
export type TeamRow = Selectable<TeamsTable>;
export type RosterRow = Selectable<RostersTable>;
export type EntrantRow = Selectable<EntrantsTable>;
export type StageRow = Selectable<StagesTable>;
export type EntrantAttributeRow = Selectable<EntrantAttributesTable>;
export type VenueRow = Selectable<VenuesTable>;
export type OfficialRow = Selectable<OfficialsTable>;
type ScheduleRow = Pick<
  Selectable<FixtureSchedulesTable>,
  'fixture_id' | 'venue_id' | 'starts_at' | 'duration_minutes'
>;
export type MatchRow = Selectable<MatchesTable>;
export type SegmentRow = Selectable<SegmentsTable>;
export type MatchEventRow = Selectable<MatchEventsTable>;

export function toOrganization(row: OrganizationRow): Organization {
  return {
    organizationId: row.organization_id,
    alias: row.alias,
    name: row.name,
  };
}

export function toTournament(row: TournamentRow): Tournament {
  return {
    tournamentId: row.tournament_id,
    organizationId: row.organization_id,
    alias: row.alias,
    name: row.name,
    disciplineRef: {
      descriptorId: row.descriptor_id,
      version: row.descriptor_version,
    },
    rulesetId: row.ruleset_id ?? undefined,
    status: row.status as Tournament['status'],
  };
}

export function toParticipant(row: ParticipantRow): Participant {
  return {
    participantId: row.participant_id,
    organizationId: row.organization_id,
    alias: row.alias ?? undefined,
    displayName: row.display_name,
    type: row.participant_type as Participant['type'],
  };
}

export function toTeam(row: TeamRow): Team {
  return {
    teamId: row.team_id,
    organizationId: row.organization_id,
    clubId: row.club_id ?? undefined,
    name: row.name,
  };
}

export function toRoster(row: RosterRow): Roster {
  return {
    rosterId: row.roster_id,
    teamId: row.team_id,
    members: row.members as unknown as Roster['members'],
  };
}

export function toEntrant(row: EntrantRow): Entrant {
  return {
    entrantId: row.entrant_id,
    tournamentId: row.tournament_id,
    entrantRef:
      row.entrant_kind === 'team'
        ? { kind: 'team', teamId: row.team_id as string }
        : { kind: 'participant', participantId: row.participant_id as string },
    seed: row.seed ?? undefined,
    status: row.status as Entrant['status'],
  };
}

export function toEntrantAttribute(row: EntrantAttributeRow): EntrantAttribute {
  return row.kind === 'numeric'
    ? { key: row.key, kind: 'numeric', value: Number(row.value_numeric) }
    : { key: row.key, kind: 'categorical', value: String(row.value_text) };
}

export function toVenue(row: VenueRow): Venue {
  return {
    venueId: row.venue_id,
    organizationId: row.organization_id,
    alias: row.alias,
    name: row.name,
    concurrentCapacity: row.concurrent_capacity,
    ...(row.address === null ? {} : { address: row.address }),
  };
}

export function toOfficial(row: OfficialRow): Official {
  return {
    officialId: row.official_id,
    organizationId: row.organization_id,
    displayName: row.display_name,
    roles: row.roles as Official['roles'],
  };
}

/**
 * `starts_at` is a bigint, which pg hands back as a string to avoid losing
 * precision. Converting here keeps that a storage detail: the domain has only
 * ever seen an epoch number.
 */
export function toResourceAssignment(
  row: ScheduleRow,
  officialIds: readonly string[],
): ResourceAssignment {
  return {
    fixtureId: row.fixture_id,
    window: { startsAt: Number(row.starts_at), durationMinutes: row.duration_minutes },
    ...(row.venue_id === null ? {} : { venueId: row.venue_id }),
    ...(officialIds.length === 0 ? {} : { officialIds }),
  };
}

export function toStage(row: StageRow): Stage {
  return {
    stageId: row.stage_id,
    tournamentId: row.tournament_id,
    number: row.number,
    name: row.name,
    format: row.format as Stage['format'],
    stageConfigurationId: row.stage_configuration_id ?? undefined,
  };
}

export function toMatch(row: MatchRow): Match {
  return {
    matchId: row.match_id,
    fixtureId: row.fixture_id,
    number: row.number,
    status: row.status as Match['status'],
    result: (row.result as unknown as Match['result']) ?? undefined,
  };
}

export function toSegment(row: SegmentRow): Segment {
  return {
    segmentId: row.segment_id,
    matchId: row.match_id,
    type: row.segment_type,
    number: row.number,
    state: row.state as Segment['state'],
  };
}

export function toRecordedEvent(row: MatchEventRow): RecordedEvent {
  return {
    eventId: row.event_id,
    matchId: row.match_id,
    segmentId: row.segment_id,
    definitionCode: row.definition_code,
    occurredAt: toIsoString(row.occurred_at),
    sequence: row.sequence,
    // The column was always `text`; since the side is an entrant id there is
    // nothing left to narrow it to.
    side: row.side ?? undefined,
    participantId: row.participant_id ?? undefined,
    payload: row.payload as Record<string, unknown>,
  };
}

/** Timestamps cross the boundary as ISO strings; the domain has no Date fields. */
export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
