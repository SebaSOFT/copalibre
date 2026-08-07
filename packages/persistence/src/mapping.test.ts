import {
  toEntrant,
  toIsoString,
  toMatch,
  toOfficial,
  toResourceAssignment,
  toVenue,
  toOrganization,
  toRecordedEvent,
  toSegment,
  toStage,
  toTeam,
  toClub,
  type ClubRow,
  toTournament,
  type EntrantRow,
  type MatchEventRow,
  type MatchRow,
  type OrganizationRow,
  type SegmentRow,
  type OfficialRow,
  type StageRow,
  type VenueRow,
  type TeamRow,
  type TournamentRow,
} from './mapping.js';

const CREATED = new Date('2026-07-29T12:00:00.000Z');

describe('snake_case row → camelCase domain mapping', () => {
  it('maps an organization row', () => {
    const row: OrganizationRow = {
      organization_id: 'org-1',
      alias: 'club-atlas',
      name: 'Club Atlas',
      created_at: CREATED,
    };
    expect(toOrganization(row)).toEqual({
      organizationId: 'org-1',
      alias: 'club-atlas',
      name: 'Club Atlas',
    });
  });

  it('maps a tournament row, lifting descriptor columns into disciplineRef', () => {
    const row: TournamentRow = {
      tournament_id: 't-1',
      organization_id: 'org-1',
      alias: 'copa-verano',
      name: 'Copa Verano',
      descriptor_id: 'd-1',
      descriptor_version: '3.0.0',
      ruleset_id: null,
      status: 'draft',
      started_at: null,
      profile_id: null,
      profile_version: null,
      created_at: CREATED,
      archived_at: null,
    };
    expect(toTournament(row)).toEqual({
      tournamentId: 't-1',
      organizationId: 'org-1',
      alias: 'copa-verano',
      name: 'Copa Verano',
      disciplineRef: { descriptorId: 'd-1', version: '3.0.0' },
      rulesetId: undefined,
      status: 'draft',
    });
  });

  it('maps nullable columns to undefined, never null', () => {
    const team: TeamRow = {
      team_id: 'tm-1',
      organization_id: 'org-1',
      alias: null,
      club_id: null,
      name: 'Equipo Uno',
      discipline_id: null,
      abbreviation: null,
      created_at: CREATED,
    };
    expect(toTeam(team).clubId).toBeUndefined();
    expect(toTeam(team).abbreviation).toBeUndefined();
  });

  it('maps a club row, carrying the short label when it has one', () => {
    const club: ClubRow = {
      club_id: 'cl-1',
      organization_id: 'org-1',
      alias: 'casa-de-italia',
      name: 'Casa de Italia',
      abbreviation: 'C I',
      created_at: CREATED,
    };

    expect(toClub(club)).toEqual({
      clubId: 'cl-1',
      organizationId: 'org-1',
      alias: 'casa-de-italia',
      name: 'Casa de Italia',
      abbreviation: 'C I',
    });
    expect(toClub({ ...club, abbreviation: null }).abbreviation).toBeUndefined();
  });

  it('maps an entrant row into the discriminated entrantRef union', () => {
    const teamEntrant: EntrantRow = {
      entrant_id: 'e-1',
      tournament_id: 't-1',
      entrant_kind: 'team',
      person_id: null,
      team_id: 'tm-1',
      seed: 4,
      status: 'accepted',
      created_at: CREATED,
    };
    expect(toEntrant(teamEntrant).entrantRef).toEqual({ kind: 'team', teamId: 'tm-1' });

    const soloEntrant: EntrantRow = {
      ...teamEntrant,
      entrant_kind: 'person',
      person_id: 'p-1',
      team_id: null,
      seed: null,
    };
    const mapped = toEntrant(soloEntrant);
    expect(mapped.entrantRef).toEqual({ kind: 'person', personId: 'p-1' });
    expect(mapped.seed).toBeUndefined();
  });

  it('maps a stage row', () => {
    const row: StageRow = {
      stage_id: 's-1',
      season_id: 's-1',
      number: 1,
      name: 'Group Stage',
      format: 'round-robin',
      stage_configuration_id: null,
      created_at: CREATED,
    };
    expect(toStage(row)).toEqual({
      stageId: 's-1',
      seasonId: 's-1',
      number: 1,
      name: 'Group Stage',
      format: 'round-robin',
      stageConfigurationId: undefined,
    });
  });

  it('maps a match row with and without a result', () => {
    const scheduled: MatchRow = {
      match_id: 'm-1',
      fixture_id: 'f-1',
      number: 1,
      status: 'scheduled',
      result: null,
      created_at: CREATED,
    };
    expect(toMatch(scheduled).result).toBeUndefined();

    const finalized: MatchRow = {
      ...scheduled,
      status: 'finalized',
      result: {
        sides: [{ entrantId: 'e-1', score: 3 }],
        recordedAt: '2026-07-29T13:00:00.000Z',
      } as never,
    };
    expect(toMatch(finalized).result?.sides).toHaveLength(1);
  });

  it("maps segment_type to the domain's type field", () => {
    const row: SegmentRow = {
      segment_id: 'sg-1',
      match_id: 'm-1',
      segment_type: 'half',
      number: 1,
      state: 'active',
      elapsed_seconds: 0,
      clock_started_at: CREATED,
      created_at: CREATED,
    };
    expect(toSegment(row).type).toBe('half');
  });

  it('maps a match event row, converting timestamps to ISO strings', () => {
    const row: MatchEventRow = {
      event_id: 'ev-1',
      match_id: 'm-1',
      segment_id: 'sg-1',
      definition_code: 'strike',
      occurred_at: CREATED,
      sequence: 1,
      side: 'entrant-atlas',
      person_id: 'p-1',
      payload: { zone: 'inner' } as never,
      created_at: CREATED,
    };
    expect(toRecordedEvent(row)).toEqual({
      eventId: 'ev-1',
      matchId: 'm-1',
      segmentId: 'sg-1',
      definitionCode: 'strike',
      occurredAt: '2026-07-29T12:00:00.000Z',
      sequence: 1,
      side: 'entrant-atlas',
      personId: 'p-1',
      payload: { zone: 'inner' },
    });
  });
});

describe('toIsoString', () => {
  it('passes a Date through as ISO', () => {
    expect(toIsoString(CREATED)).toBe('2026-07-29T12:00:00.000Z');
  });

  it('normalizes a string timestamp to ISO', () => {
    expect(toIsoString('2026-07-29T12:00:00Z')).toBe('2026-07-29T12:00:00.000Z');
  });
});

describe('mapping edge cases', () => {
  it('maps an entrant with no side/participant columns set', () => {
    const row: MatchEventRow = {
      event_id: 'ev-2',
      match_id: 'm-1',
      segment_id: 'sg-1',
      definition_code: 'pause',
      occurred_at: CREATED,
      sequence: 2,
      side: null,
      person_id: null,
      payload: {} as never,
      created_at: CREATED,
    };
    const mapped = toRecordedEvent(row);
    expect(mapped.side).toBeUndefined();
    expect(mapped.personId).toBeUndefined();
  });

  it('maps a tournament that already has a ruleset attached', () => {
    const row: TournamentRow = {
      tournament_id: 't-2',
      organization_id: 'org-1',
      alias: 'copa-con-reglas',
      name: 'Copa Con Reglas',
      descriptor_id: 'd-1',
      descriptor_version: '2.0.0',
      ruleset_id: 'rs-1',
      status: 'published',
      started_at: null,
      profile_id: null,
      profile_version: null,
      created_at: CREATED,
      archived_at: null,
    };
    expect(toTournament(row).rulesetId).toBe('rs-1');
  });

  it('maps a stage that already has a configuration attached', () => {
    const row: StageRow = {
      stage_id: 's-2',
      season_id: 's-1',
      number: 2,
      name: 'Playoffs',
      format: 'single-elimination',
      stage_configuration_id: 'sc-1',
      created_at: CREATED,
    };
    expect(toStage(row).stageConfigurationId).toBe('sc-1');
  });
});

describe('scheduling rows', () => {
  it('maps a venue, dropping an absent address rather than carrying a null', () => {
    const row: VenueRow = {
      venue_id: 'v-1',
      organization_id: 'org-1',
      alias: 'club-central',
      name: 'Club Central',
      concurrent_capacity: 3,
      address: null,
      created_at: CREATED,
    };

    expect(toVenue(row)).toEqual({
      venueId: 'v-1',
      organizationId: 'org-1',
      alias: 'club-central',
      name: 'Club Central',
      concurrentCapacity: 3,
    });
  });

  it('keeps an address the operator supplied', () => {
    const row: VenueRow = {
      venue_id: 'v-2',
      organization_id: 'org-1',
      alias: 'polideportivo',
      name: 'Polideportivo',
      concurrent_capacity: 1,
      address: 'Av. Libertador 1200',
      created_at: CREATED,
    };

    expect(toVenue(row).address).toBe('Av. Libertador 1200');
  });

  it('maps an official with the roles they may be assigned to', () => {
    const row: OfficialRow = {
      official_id: 'o-1',
      organization_id: 'org-1',
      display_name: 'Ana Gómez',
      roles: ['referee', 'table-official'] as never,
      created_at: CREATED,
    };

    expect(toOfficial(row)).toEqual({
      officialId: 'o-1',
      organizationId: 'org-1',
      displayName: 'Ana Gómez',
      roles: ['referee', 'table-official'],
    });
  });

  it('converts a bigint epoch back to a number, which is a storage detail', () => {
    // pg hands a bigint back as a string to avoid losing precision; the domain
    // has only ever seen an epoch number.
    const assignment = toResourceAssignment(
      {
        fixture_id: 'f-1',
        venue_id: 'v-1',
        starts_at: '1785333600000',
        duration_minutes: 90,
      },
      ['o-1'],
    );

    expect(assignment).toEqual({
      fixtureId: 'f-1',
      window: { startsAt: 1785333600000, durationMinutes: 90 },
      venueId: 'v-1',
      officialIds: ['o-1'],
    });
  });

  it('omits a venue and officials that were never assigned', () => {
    const assignment = toResourceAssignment(
      { fixture_id: 'f-2', venue_id: null, starts_at: '1785333600000', duration_minutes: 60 },
      [],
    );

    expect(assignment).toEqual({
      fixtureId: 'f-2',
      window: { startsAt: 1785333600000, durationMinutes: 60 },
    });
  });
});
