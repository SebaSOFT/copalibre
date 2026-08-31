import {
  toEntrant,
  toEntrantAttribute,
  toFixture,
  toGroup,
  toIdentityPrincipal,
  toIsoString,
  toMatch,
  toOfficial,
  toOrganizationInvitation,
  toOrganizationRoleAssignment,
  toResourceAssignment,
  toSchedule,
  toScheduleSlot,
  toVenue,
  toOrganization,
  toRecordedEvent,
  toSegment,
  toStage,
  toTeam,
  toClub,
  toZone,
  type ClubRow,
  type EntrantAttributeRow,
  toTournament,
  type EntrantRow,
  type MatchEventRow,
  type MatchRow,
  type FixtureRow,
  type GroupRow,
  type IdentityPrincipalRow,
  type OrganizationInviteRow,
  type OrganizationRoleAssignmentRow,
  type OrganizationRow,
  type SegmentRow,
  type OfficialRow,
  type StageRow,
  type VenueRow,
  type TeamRow,
  type TournamentRow,
  type ZoneRow,
} from './mapping.js';

const CREATED = new Date('2026-07-29T12:00:00.000Z');

describe('snake_case row → camelCase domain mapping', () => {
  it('maps an organization row with no emblem', () => {
    const row: OrganizationRow = {
      organization_id: 'org-1',
      alias: 'club-atlas',
      name: 'Club Atlas',
      primary_language: 'es',
      timezone: 'UTC',
      emblem_object_id: null,
      created_at: CREATED,
    };
    expect(toOrganization(row)).toEqual({
      organizationId: 'org-1',
      alias: 'club-atlas',
      name: 'Club Atlas',
      primaryLanguage: 'es',
      timezone: 'UTC',
    });
  });

  it('maps an organization row with an emblem', () => {
    const row: OrganizationRow = {
      organization_id: 'org-1',
      alias: 'club-atlas',
      name: 'Club Atlas',
      primary_language: 'es',
      timezone: 'UTC',
      emblem_object_id: 'object-1',
      created_at: CREATED,
    };
    expect(toOrganization(row)).toEqual({
      organizationId: 'org-1',
      alias: 'club-atlas',
      name: 'Club Atlas',
      primaryLanguage: 'es',
      timezone: 'UTC',
      emblemObjectId: 'object-1',
    });
  });

  it('maps organization access rows and omits nullable identity fields', () => {
    const assignment = toOrganizationRoleAssignment({
      assignment_id: 'assignment-1',
      organization_id: 'org-1',
      principal_id: 'principal-1',
      email: 'organizer@example.test',
      role: 'admin',
      status: 'active',
      created_at: CREATED,
      updated_at: CREATED,
      deleted_at: CREATED,
    } as OrganizationRoleAssignmentRow);
    const identity = toIdentityPrincipal({
      principal_id: 'principal-1',
      email: 'organizer@example.test',
      oidc_subject_id: null,
      name: null,
      picture: null,
      created_at: CREATED,
      updated_at: CREATED,
    } as IdentityPrincipalRow);
    const invitation = toOrganizationInvitation({
      invitation_id: 'invite-1',
      organization_id: 'org-1',
      recipient_email: 'referee@example.test',
      role: 'referee',
      status: 'pending',
      token_hash: 'hash',
      expires_at: CREATED,
      accepted_at: null,
      accepted_principal_id: null,
      created_at: CREATED,
    } as OrganizationInviteRow);

    expect(assignment).toMatchObject({
      assignmentId: 'assignment-1',
      deletedAt: '2026-07-29T12:00:00.000Z',
    });
    expect(identity).toEqual({ principalId: 'principal-1', email: 'organizer@example.test' });
    expect(invitation.expiresAt).toBe('2026-07-29T12:00:00.000Z');
    expect(
      toIdentityPrincipal({
        ...({
          principal_id: 'principal-2',
          email: 'complete@example.test',
          oidc_subject_id: 'oidc-2',
          name: 'Complete Identity',
          picture: 'https://example.test/avatar.png',
          created_at: CREATED,
          updated_at: CREATED,
        } as IdentityPrincipalRow),
      }),
    ).toMatchObject({ oidcSubjectId: 'oidc-2', name: 'Complete Identity' });
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
      emblem_object_id: null,
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
    expect(toClub({ ...club, emblem_object_id: 'ob-1' }).emblemObjectId).toBe('ob-1');
  });

  it('maps an entrant row into the discriminated entrantRef union', () => {
    const teamEntrant: EntrantRow = {
      entrant_id: 'e-1',
      tournament_id: 't-1',
      entrant_kind: 'team',
      person_id: null,
      team_id: 'tm-1',
      abbreviation: null,
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

  it('maps numeric and categorical entrant attributes', () => {
    expect(
      toEntrantAttribute({
        kind: 'numeric',
        key: 'ranking',
        value_numeric: 42,
        value_text: null,
      } as EntrantAttributeRow),
    ).toEqual({ key: 'ranking', kind: 'numeric', value: 42 });
    expect(
      toEntrantAttribute({
        kind: 'categorical',
        key: 'region',
        value_numeric: null,
        value_text: 'cuyo',
      } as EntrantAttributeRow),
    ).toEqual({ key: 'region', kind: 'categorical', value: 'cuyo' });
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

  it('maps zone, group, and fixture scope fields without leaking nulls', () => {
    expect(
      toZone({ zone_id: 'z-1', stage_id: 's-1', number: 1, name: 'Zona Norte' } as ZoneRow),
    ).toEqual({ zoneId: 'z-1', stageId: 's-1', number: 1, name: 'Zona Norte' });
    expect(
      toGroup({ group_id: 'g-1', zone_id: 'z-1', number: 2, name: 'Grupo B' } as GroupRow),
    ).toEqual({ groupId: 'g-1', zoneId: 'z-1', number: 2, name: 'Grupo B' });
    expect(
      toFixture({
        fixture_id: 'f-1',
        stage_id: 's-1',
        zone_id: 'z-1',
        group_id: 'g-1',
        round: 1,
        home_entrant_id: 'e-1',
        away_entrant_id: null,
        created_at: CREATED,
      } as FixtureRow),
    ).toMatchObject({
      zoneId: 'z-1',
      groupId: 'g-1',
      homeEntrantId: 'e-1',
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
      notes: 'Under review by table official',
      segment_elapsed_seconds: 842,
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
      notes: 'Under review by table official',
      segmentElapsedSeconds: 842,
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
      notes: null,
      segment_elapsed_seconds: null,
      created_at: CREATED,
    };
    const mapped = toRecordedEvent(row);
    expect(mapped.side).toBeUndefined();
    expect(mapped.personId).toBeUndefined();
    expect(mapped.notes).toBeUndefined();
    expect(mapped.segmentElapsedSeconds).toBeUndefined();
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
    expect(toTournament({ ...row, archived_at: CREATED }).archivedAt).toBe(
      '2026-07-29T12:00:00.000Z',
    );
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

  it('omits absent fixture scope and inactive segment clock fields', () => {
    expect(
      toFixture({
        fixture_id: 'f-2',
        stage_id: 's-1',
        zone_id: null,
        group_id: null,
        round: 2,
        home_entrant_id: null,
        away_entrant_id: null,
        scheduled_at: null,
        created_at: CREATED,
      } as FixtureRow),
    ).toEqual({ fixtureId: 'f-2', stageId: 's-1', round: 2 });
    expect(
      toSegment({
        segment_id: 'sg-2',
        match_id: 'm-1',
        segment_type: 'half',
        number: 2,
        state: 'pending',
        elapsed_seconds: 0,
        clock_started_at: null,
        created_at: CREATED,
      } as SegmentRow).clockStartedAt,
    ).toBeUndefined();
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
      details: null,
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
      details: null,
      created_at: CREATED,
    };

    expect(toVenue(row).address).toBe('Av. Libertador 1200');
  });

  it('keeps operator-entered details, physical or virtual', () => {
    const row: VenueRow = {
      venue_id: 'v-3',
      organization_id: 'org-1',
      alias: 'servidor-1',
      name: 'Servidor 1',
      concurrent_capacity: 1,
      address: null,
      details: { region: 'sa-east-1', map: 'de_dust2' },
      created_at: CREATED,
    };

    expect(toVenue(row).details).toEqual({ region: 'sa-east-1', map: 'de_dust2' });
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

  it('maps a schedule row and venue ids to Schedule', () => {
    const schedule = toSchedule(
      {
        schedule_id: 's-1',
        organization_id: 'org-1',
        name: 'Horario',
        starts_at: '1785333600000',
        ends_at: '1785355200000',
        slot_minutes: 90,
        turnaround_minutes: 15,
        created_at: CREATED,
      },
      ['v-1', 'v-2'],
    );

    expect(schedule).toEqual({
      scheduleId: 's-1',
      organizationId: 'org-1',
      name: 'Horario',
      startsAt: 1785333600000,
      endsAt: 1785355200000,
      slotMinutes: 90,
      turnaroundMinutes: 15,
      venueIds: ['v-1', 'v-2'],
    });
  });

  it('maps a schedule slot row to ScheduleSlot', () => {
    const slot = toScheduleSlot({
      slot_id: 'slot-1',
      schedule_id: 's-1',
      venue_id: 'v-1',
      starts_at: '1785333600000',
      created_at: CREATED,
    });

    expect(slot).toEqual({
      slotId: 'slot-1',
      scheduleId: 's-1',
      venueId: 'v-1',
      startsAt: 1785333600000,
    });
  });

  it('maps a match schedule assignment row and officials to ResourceAssignment', () => {
    const assignment = toResourceAssignment(
      {
        match_id: 'm-1',
        slot_id: 'slot-1',
        published: true,
        created_at: CREATED,
      },
      ['o-1'],
    );

    expect(assignment).toEqual({
      matchId: 'm-1',
      slotId: 'slot-1',
      officialIds: ['o-1'],
    });
  });

  it('omits officials when none were assigned', () => {
    const assignment = toResourceAssignment(
      {
        match_id: 'm-2',
        slot_id: 'slot-2',
        published: false,
        created_at: CREATED,
      },
      [],
    );

    expect(assignment).toEqual({
      matchId: 'm-2',
      slotId: 'slot-2',
    });
  });
});
