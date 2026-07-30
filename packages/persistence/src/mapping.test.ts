import {
  toEntrant,
  toIsoString,
  toMatch,
  toOrganization,
  toParticipant,
  toRecordedEvent,
  toRoster,
  toSegment,
  toStage,
  toTeam,
  toTournament,
  type EntrantRow,
  type MatchEventRow,
  type MatchRow,
  type OrganizationRow,
  type ParticipantRow,
  type RosterRow,
  type SegmentRow,
  type StageRow,
  type TeamRow,
  type TournamentRow,
} from './mapping';

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
      descriptor_version: 3,
      ruleset_id: null,
      status: 'draft',
      created_at: CREATED,
    };
    expect(toTournament(row)).toEqual({
      tournamentId: 't-1',
      organizationId: 'org-1',
      alias: 'copa-verano',
      name: 'Copa Verano',
      disciplineRef: { descriptorId: 'd-1', version: 3 },
      rulesetId: undefined,
      status: 'draft',
    });
  });

  it('maps nullable columns to undefined, never null', () => {
    const participant: ParticipantRow = {
      participant_id: 'p-1',
      organization_id: 'org-1',
      alias: null,
      display_name: 'Jugador Uno',
      participant_type: 'individual',
      created_at: CREATED,
    };
    expect(toParticipant(participant).alias).toBeUndefined();

    const team: TeamRow = {
      team_id: 'tm-1',
      organization_id: 'org-1',
      club_id: null,
      name: 'Equipo Uno',
      created_at: CREATED,
    };
    expect(toTeam(team).clubId).toBeUndefined();
  });

  it('maps a roster row preserving member documents', () => {
    const row: RosterRow = {
      roster_id: 'r-1',
      team_id: 'tm-1',
      members: [{ participantId: 'p-1', role: 'player' }] as never,
      created_at: CREATED,
    };
    expect(toRoster(row).members).toEqual([{ participantId: 'p-1', role: 'player' }]);
  });

  it('maps an entrant row into the discriminated entrantRef union', () => {
    const teamEntrant: EntrantRow = {
      entrant_id: 'e-1',
      tournament_id: 't-1',
      entrant_kind: 'team',
      participant_id: null,
      team_id: 'tm-1',
      seed: 4,
      status: 'accepted',
      created_at: CREATED,
    };
    expect(toEntrant(teamEntrant).entrantRef).toEqual({ kind: 'team', teamId: 'tm-1' });

    const soloEntrant: EntrantRow = {
      ...teamEntrant,
      entrant_kind: 'participant',
      participant_id: 'p-1',
      team_id: null,
      seed: null,
    };
    const mapped = toEntrant(soloEntrant);
    expect(mapped.entrantRef).toEqual({ kind: 'participant', participantId: 'p-1' });
    expect(mapped.seed).toBeUndefined();
  });

  it('maps a stage row', () => {
    const row: StageRow = {
      stage_id: 's-1',
      tournament_id: 't-1',
      number: 1,
      name: 'Group Stage',
      format: 'round-robin',
      stage_configuration_id: null,
      created_at: CREATED,
    };
    expect(toStage(row)).toEqual({
      stageId: 's-1',
      tournamentId: 't-1',
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
      side: 'home',
      participant_id: 'p-1',
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
      side: 'home',
      participantId: 'p-1',
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
      participant_id: null,
      payload: {} as never,
      created_at: CREATED,
    };
    const mapped = toRecordedEvent(row);
    expect(mapped.side).toBeUndefined();
    expect(mapped.participantId).toBeUndefined();
  });

  it('maps a tournament that already has a ruleset attached', () => {
    const row: TournamentRow = {
      tournament_id: 't-2',
      organization_id: 'org-1',
      alias: 'copa-con-reglas',
      name: 'Copa Con Reglas',
      descriptor_id: 'd-1',
      descriptor_version: 2,
      ruleset_id: 'rs-1',
      status: 'published',
      created_at: CREATED,
    };
    expect(toTournament(row).rulesetId).toBe('rs-1');
  });

  it('maps a stage that already has a configuration attached', () => {
    const row: StageRow = {
      stage_id: 's-2',
      tournament_id: 't-1',
      number: 2,
      name: 'Playoffs',
      format: 'single-elimination',
      stage_configuration_id: 'sc-1',
      created_at: CREATED,
    };
    expect(toStage(row).stageConfigurationId).toBe('sc-1');
  });
});
