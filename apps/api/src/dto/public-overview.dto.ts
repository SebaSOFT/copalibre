import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LocalizedLabel } from '@copalibre/domain';
import { FixtureSourcesResponse } from './fixture-side-source.dto.js';
import { PublicStandingsRowResponse } from './public-standings.dto.js';

export class PublicScheduleVenueResponse {
  @ApiProperty()
  alias!: string;

  @ApiProperty()
  name!: string;
}

export class PublicPreviousPlacementResponse {
  @ApiProperty({ description: 'Unix epoch milliseconds' })
  startsAt!: number;

  @ApiProperty({ type: PublicScheduleVenueResponse, nullable: true })
  venue!: PublicScheduleVenueResponse | null;
}

export class PublicOverviewMatchResponse extends FixtureSourcesResponse {
  @ApiPropertyOptional()
  venueName?: string;
  @ApiPropertyOptional({ description: 'Independent published schedule replay version' })
  scheduleVersion?: number;

  @ApiPropertyOptional({ type: PublicPreviousPlacementResponse, nullable: true })
  rescheduledFrom?: PublicPreviousPlacementResponse | null;

  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiPropertyOptional({
    description: 'The match number as persisted: a per-fixture series-game index',
  })
  matchNumber?: number;

  @ApiPropertyOptional({
    description:
      'The 1-based ordinal of the match within its stage, the one the public match route addresses it by. Absent before a fixture becomes a match.',
  })
  stageOrdinal?: number;

  @ApiProperty()
  stageNumber!: number;

  @ApiPropertyOptional({
    description: 'The stage name as the organizer named it; absent when empty',
  })
  stageName?: string;

  @ApiProperty()
  round!: number;

  @ApiPropertyOptional({
    description:
      "The zone of the match's group as the organizer named it; absent for an implicit zone",
  })
  zoneName?: string;

  @ApiPropertyOptional({
    description: 'The match group as the organizer named it; absent for an implicit group',
  })
  groupName?: string;

  @ApiProperty({ enum: ['upcoming', 'live', 'final'] })
  status!: 'upcoming' | 'live' | 'final';

  @ApiPropertyOptional({ format: 'uuid' })
  homeEntrantId?: string;

  @ApiPropertyOptional()
  homeName?: string;

  @ApiPropertyOptional()
  homeHiddenAtRequest?: boolean;

  @ApiPropertyOptional()
  homePublicProfileAvailable?: boolean;

  @ApiPropertyOptional()
  homeAbbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  homeClubId?: string;

  @ApiPropertyOptional()
  homeEmblemObjectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  awayEntrantId?: string;

  @ApiPropertyOptional()
  awayName?: string;

  @ApiPropertyOptional()
  awayHiddenAtRequest?: boolean;

  @ApiPropertyOptional()
  awayPublicProfileAvailable?: boolean;

  @ApiPropertyOptional()
  awayAbbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  awayClubId?: string;

  @ApiPropertyOptional()
  awayEmblemObjectId?: string;

  @ApiPropertyOptional()
  homeScore?: number;

  @ApiPropertyOptional()
  awayScore?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  scheduledAt?: string;
}

export class PublicOverviewClubResponse {
  @ApiProperty({ format: 'uuid' })
  clubId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  abbreviation?: string;

  @ApiProperty({ description: 'Public club alias. Every club has one.' })
  alias!: string;

  @ApiPropertyOptional()
  emblemObjectId?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Aliases this club held before a rename, within its organization. A public URL naming one of them ' +
      'is redirected to the current alias. Absent when the club was never renamed.',
  })
  formerAliases?: string[];
}

export class PublicOrganizationClubResponse extends PublicOverviewClubResponse {
  @ApiPropertyOptional({
    description:
      "Alias of the organization's first in-progress published tournament with an entrant from this club, when one exists",
  })
  tournamentAlias?: string;
}

export class PublicOverviewVenueResponse {
  @ApiProperty()
  alias!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  address?: string;

  @ApiProperty({ description: 'How many matches the venue can hold at once: its court count.' })
  courtCount!: number;
}

export class PublicObjectReferenceResponse {
  @ApiProperty()
  key!: string;
}

export class PublicOverviewStageZoneResponse {
  @ApiPropertyOptional({ description: 'Zone name; absent for an implicit zone' })
  zoneName?: string;

  @ApiProperty({ description: 'Effective competition format of this zone' })
  format!: string;
}

export class PublicOverviewStageResponse {
  @ApiProperty()
  stageNumber!: number;

  @ApiPropertyOptional({
    description: 'The stage name as the organizer named it; absent when empty',
  })
  stageName?: string;

  @ApiProperty({ description: 'Effective competition format of this stage' })
  format!: string;

  @ApiPropertyOptional({
    type: [PublicOverviewStageZoneResponse],
    description: 'Declared non-implicit zones of this stage with their effective formats',
  })
  zones?: PublicOverviewStageZoneResponse[];
}

export class PublicOverviewResponse {
  @ApiProperty()
  organizationAlias!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiPropertyOptional({
    description: 'The IANA time zone of the organization, in which its schedule times are read.',
  })
  organizationTimeZone?: string;

  @ApiProperty()
  tournamentAlias!: string;

  @ApiProperty()
  tournamentName!: string;

  @ApiProperty()
  seasonName!: string;

  @ApiPropertyOptional({ type: [PublicObjectReferenceResponse] })
  disciplineImages?: PublicObjectReferenceResponse[];

  @ApiPropertyOptional({ description: "The discipline's declared name, in English." })
  disciplineName?: string;

  @ApiPropertyOptional({
    description: 'The discipline name as declared, with its available translations',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  localizedDisciplineName?: LocalizedLabel;

  @ApiPropertyOptional({
    type: [PublicOverviewVenueResponse],
    description:
      'Every venue holding a published match, sorted by name. Free-form venue details are never published.',
  })
  venues?: PublicOverviewVenueResponse[];

  @ApiProperty({ type: [PublicOverviewMatchResponse] })
  matches!: PublicOverviewMatchResponse[];

  @ApiPropertyOptional({ type: [PublicOverviewStageResponse] })
  stages?: PublicOverviewStageResponse[];

  @ApiPropertyOptional({ description: 'Stage number ranked by standingsPreview' })
  standingsStageNumber?: number;

  @ApiPropertyOptional({
    enum: ['table-projection', 'engine'],
    description:
      'Source of standingsPreview; engine when discipline declares no group-phase layout',
  })
  standingsSource?: 'table-projection' | 'engine';

  @ApiPropertyOptional({ type: [PublicStandingsRowResponse] })
  standingsPreview?: PublicStandingsRowResponse[];

  @ApiPropertyOptional({
    description:
      'Whether `standingsPreview` rows count one result per series or one per played match. ' +
      'Absent when the previewed stage declares no series at all.',
    enum: ['series', 'match'],
  })
  standingsGrain?: 'series' | 'match';

  @ApiPropertyOptional({ type: [PublicOverviewClubResponse] })
  clubs?: PublicOverviewClubResponse[];

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  ruleset!: Record<string, string>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      "Each `ruleset` key's declared display label, when the installed discipline's field " +
      'policy declares one — absent keys fall back to a humanized dot-path client-side ' +
      '.',
  })
  rulesetLabels?: Record<string, string | LocalizedLabel>;

  @ApiPropertyOptional({ enum: ['upcoming', 'live', 'finished'] })
  status?: 'upcoming' | 'live' | 'finished';

  @ApiPropertyOptional({ type: () => [PublicTournamentWinnerZoneResponse] })
  winners?: PublicTournamentWinnerZoneResponse[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Object storage ID of the tournament emblem, when one has been uploaded.',
  })
  emblemObjectId?: string;
}

export class PublicTournamentEntrantPodiumResponse {
  @ApiProperty({ format: 'uuid' })
  entrantId!: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  hiddenAtRequest?: boolean;

  @ApiPropertyOptional()
  publicProfileAvailable?: boolean;

  @ApiPropertyOptional()
  abbreviation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  clubId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  emblemObjectId?: string;
}

export class PublicTournamentWinnerZoneResponse {
  @ApiPropertyOptional({ format: 'uuid' })
  zoneId?: string;

  @ApiPropertyOptional()
  zoneName?: string;

  @ApiProperty({ type: PublicTournamentEntrantPodiumResponse })
  champion!: PublicTournamentEntrantPodiumResponse;

  @ApiPropertyOptional({
    type: [PublicTournamentEntrantPodiumResponse],
    description: 'Every champion in this zone, including multiple entrants for a shared title.',
  })
  champions?: PublicTournamentEntrantPodiumResponse[];

  @ApiPropertyOptional({ type: PublicTournamentEntrantPodiumResponse })
  runnerUp?: PublicTournamentEntrantPodiumResponse;

  @ApiPropertyOptional({
    type: PublicTournamentEntrantPodiumResponse,
    description: 'Rank three only when a completed ranked stage explicitly resolves one entrant.',
  })
  thirdPlace?: PublicTournamentEntrantPodiumResponse;
}

export class PublicTournamentDisciplineSummaryResponse {
  @ApiProperty()
  descriptorId!: string;

  @ApiProperty()
  version!: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'The discipline name as declared, with its available translations',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  localizedName?: LocalizedLabel;
}

export class PublicTournamentDatesResponse {
  @ApiPropertyOptional({ format: 'date-time' })
  startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  archivedAt?: string;
}

export class PublicOrganizationLiveMatchResponse {
  @ApiProperty({ format: 'uuid' })
  matchId!: string;

  @ApiProperty()
  stageNumber!: number;

  @ApiPropertyOptional({
    description: 'The stage name as the organizer named it; absent when empty',
  })
  stageName?: string;

  @ApiProperty()
  matchNumber!: number;

  @ApiProperty()
  home!: string;

  @ApiProperty()
  away!: string;

  @ApiPropertyOptional()
  homeHiddenAtRequest?: boolean;

  @ApiPropertyOptional()
  awayHiddenAtRequest?: boolean;

  @ApiProperty()
  homeScore!: number;

  @ApiProperty()
  awayScore!: number;
}

export class PublicTournamentProgressResponse {
  @ApiPropertyOptional({
    description:
      'Stage number of the first stage with unresolved matches; absent when all matches are resolved',
  })
  currentStageNumber?: number;

  @ApiPropertyOptional({
    description:
      'Stage name of the first stage with unresolved matches; absent when empty or when all matches are resolved',
  })
  currentStageName?: string;

  @ApiProperty({ description: 'Number of resolved matches across the tournament' })
  resolvedMatches!: number;

  @ApiProperty({ description: 'Total resolvable matches across the tournament' })
  totalMatches!: number;
}

export class PublicTournamentScheduleWindowResponse {
  @ApiPropertyOptional({ format: 'date-time' })
  firstKickoffAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  lastKickoffAt?: string;
}

export class PublicTournamentListingItemResponse {
  @ApiProperty({ format: 'uuid' })
  tournamentId!: string;

  @ApiProperty()
  alias!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['upcoming', 'live', 'finished'] })
  status!: 'upcoming' | 'live' | 'finished';

  @ApiProperty({ type: PublicTournamentDisciplineSummaryResponse })
  discipline!: PublicTournamentDisciplineSummaryResponse;

  @ApiPropertyOptional({ type: PublicTournamentDatesResponse })
  dates?: PublicTournamentDatesResponse;

  @ApiPropertyOptional({ type: PublicTournamentProgressResponse })
  progress?: PublicTournamentProgressResponse;

  @ApiPropertyOptional({ type: PublicTournamentScheduleWindowResponse })
  schedule?: PublicTournamentScheduleWindowResponse;

  @ApiPropertyOptional({
    description: 'Number of distinct venues with at least one published match in this tournament',
  })
  venueCount?: number;

  @ApiPropertyOptional({ type: [PublicTournamentWinnerZoneResponse] })
  winners?: PublicTournamentWinnerZoneResponse[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'object_metadata.object_id of the tournament emblem',
  })
  emblemObjectId?: string;

  @ApiProperty({
    description:
      'Whether the organizer flagged this tournament as featured. Independent of `status`: live is ' +
      'urgent, featured is curated, and a tournament can be either, both, or neither.',
  })
  featured!: boolean;

  @ApiPropertyOptional({
    type: () => [PublicOrganizationLiveMatchResponse],
    description: 'Matches currently in progress for this tournament; empty otherwise.',
  })
  liveMatches?: PublicOrganizationLiveMatchResponse[];
}

/** A club's podium place in one zone of a finished tournament. */
export class PublicClubPlacementResponse {
  @ApiProperty({ enum: ['champion', 'runner-up', 'third-place'] })
  place!: 'champion' | 'runner-up' | 'third-place';

  @ApiPropertyOptional({
    description: 'The zone the place was won in, when the final stage has zones',
  })
  zoneName?: string;
}

/** One published tournament in which a club has a team entrant. */
export class PublicOrganizationClubTournamentResponse {
  @ApiProperty()
  alias!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['upcoming', 'live', 'finished'] })
  status!: 'upcoming' | 'live' | 'finished';

  @ApiProperty({ type: PublicTournamentDisciplineSummaryResponse })
  discipline!: PublicTournamentDisciplineSummaryResponse;

  @ApiPropertyOptional({ type: PublicTournamentDatesResponse })
  dates?: PublicTournamentDatesResponse;

  @ApiPropertyOptional()
  emblemObjectId?: string;

  @ApiPropertyOptional({
    type: [PublicClubPlacementResponse],
    description: "The club's podium places in a finished tournament. Absent when it has none.",
  })
  placements?: PublicClubPlacementResponse[];
}

/** A club across its organization's published tournaments. */
export class PublicOrganizationClubHistoryResponse {
  @ApiProperty()
  organizationAlias!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiPropertyOptional()
  organizationEmblemObjectId?: string;

  @ApiProperty({ type: PublicOverviewClubResponse })
  club!: PublicOverviewClubResponse;

  @ApiProperty({
    type: [PublicOrganizationClubTournamentResponse],
    description:
      'Published tournaments with a team entrant from the club, newest first. Draft tournaments never appear.',
  })
  tournaments!: PublicOrganizationClubTournamentResponse[];
}

export class PublicOrganizationTournamentListResponse {
  @ApiProperty()
  organizationAlias!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiPropertyOptional({ description: 'object_metadata.object_id of the organization emblem' })
  organizationEmblemObjectId?: string;

  @ApiProperty({ type: [PublicTournamentListingItemResponse] })
  tournaments!: PublicTournamentListingItemResponse[];

  @ApiProperty({ type: [PublicOrganizationClubResponse] })
  clubs!: PublicOrganizationClubResponse[];
}
