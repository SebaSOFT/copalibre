import {
  type Club,
  type Entrant,
  type EntrantAttribute,
  type SeedPlacement,
  type StageAllocation,
  type Team,
} from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../schema.js';
import type { EventOrigin } from '../outbox.js';
import type { UnitOfWork } from '../transaction.js';
import { ClubTeamRepository } from './enrollment/club-team-repository.js';
import { EntrantRepository } from './enrollment/entrant-repository.js';
import { ParticipantQueryRepository } from './enrollment/participant-queries.js';
import { EntrantNameRepository } from './enrollment/entrant-names.js';
import {
  type AuditContext,
  type ParticipantTeamMembership,
  type ParticipantReportedResult,
} from './enrollment/enrollment-support.js';

/** Clubs, teams, registrations and entrant attributes. */
export class EnrollmentRepository {
  private readonly clubTeams: ClubTeamRepository;
  private readonly entrants: EntrantRepository;
  private readonly participants: ParticipantQueryRepository;
  private readonly names: EntrantNameRepository;
  constructor(private readonly db: Kysely<Database>) {
    this.clubTeams = new ClubTeamRepository(db);
    this.entrants = new EntrantRepository(db);
    this.participants = new ParticipantQueryRepository(db);
    this.names = new EntrantNameRepository(db);
  }

  createClub(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly name: string;
      readonly alias?: string;
      readonly abbreviation?: string;
      readonly origin?: EventOrigin;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Club> {
    return this.clubTeams.createClub(uow, input);
  }
  suggestClubAlias(organizationId: string, name: string, abbreviation?: string): Promise<string> {
    return this.clubTeams.suggestClubAlias(organizationId, name, abbreviation);
  }
  findClubByAlias(
    executor: Kysely<Database> | Transaction<Database>,
    organizationId: string,
    alias: string,
  ): Promise<Club | undefined> {
    return this.clubTeams.findClubByAlias(executor, organizationId, alias);
  }
  private assertClubAliasFree(
    executor: Kysely<Database> | Transaction<Database>,
    organizationId: string,
    alias: string,
    clubId?: string,
  ): Promise<void> {
    return this.clubTeams.assertClubAliasFree(executor, organizationId, alias, clubId);
  }
  updateClub(
    uow: UnitOfWork,
    input: {
      readonly clubId: string;
      readonly organizationId: string;
      readonly name?: string;
      readonly alias?: string;
      readonly abbreviation?: string | null;
      readonly emblemObjectId?: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Club> {
    return this.clubTeams.updateClub(uow, input);
  }
  findClub(clubId: string): Promise<Club | undefined> {
    return this.clubTeams.findClub(clubId);
  }
  listClubs(organizationId: string): Promise<readonly Club[]> {
    return this.clubTeams.listClubs(organizationId);
  }
  createTeam(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly alias?: string;
      readonly clubId?: string;
      readonly name: string;
      readonly disciplineId?: string;
      readonly abbreviation?: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Team> {
    return this.clubTeams.createTeam(uow, input);
  }
  updateTeam(
    uow: UnitOfWork,
    input: {
      readonly teamId: string;
      readonly organizationId: string;
      readonly name?: string;
      readonly alias?: string;
      readonly abbreviation?: string | null;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Team> {
    return this.clubTeams.updateTeam(uow, input);
  }
  removeTeam(uow: UnitOfWork, input: { readonly teamId: string } & AuditContext): Promise<void> {
    return this.clubTeams.removeTeam(uow, input);
  }
  findTeam(teamId: string): Promise<Team | undefined> {
    return this.clubTeams.findTeam(teamId);
  }
  findTeamByAlias(organizationId: string, alias: string): Promise<Team | undefined> {
    return this.clubTeams.findTeamByAlias(organizationId, alias);
  }
  listTeamsByClub(organizationId: string, clubId: string): Promise<readonly Team[]> {
    return this.clubTeams.listTeamsByClub(organizationId, clubId);
  }
  replaceTeamByAlias(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly alias: string;
      readonly name: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<{ readonly team: Team; readonly created: boolean }> {
    return this.clubTeams.replaceTeamByAlias(uow, input);
  }
  findEntrantForRef(
    tournamentId: string,
    entrantRef: Entrant['entrantRef'],
  ): Promise<Entrant | undefined> {
    return this.entrants.findEntrantForRef(tournamentId, entrantRef);
  }
  listRegisteredTeamAliases(tournamentId: string): Promise<readonly string[]> {
    return this.clubTeams.listRegisteredTeamAliases(tournamentId);
  }
  private suggestTeamAlias(
    executor: Kysely<Database> | Transaction<Database>,
    organizationId: string,
    name: string,
  ): Promise<string> {
    return this.clubTeams.suggestTeamAlias(executor, organizationId, name);
  }
  registerEntrant(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly entrantRef: Entrant['entrantRef'];
      readonly abbreviation?: string;
      readonly seed?: number;
      readonly origin?: EventOrigin;
    } & AuditContext,
  ): Promise<Entrant> {
    return this.entrants.registerEntrant(uow, input);
  }
  setEntrantAbbreviation(
    uow: UnitOfWork,
    input: {
      readonly entrantId: string;
      readonly abbreviation: string;
    } & AuditContext,
  ): Promise<Entrant> {
    return this.entrants.setEntrantAbbreviation(uow, input);
  }
  listEntrantsNeedingAbbreviation(tournamentId: string): Promise<readonly Entrant[]> {
    return this.entrants.listEntrantsNeedingAbbreviation(tournamentId);
  }
  setEntrantStatus(
    uow: UnitOfWork,
    input: {
      readonly entrantId: string;
      readonly status: Entrant['status'];
      readonly reason?: string;
    } & AuditContext,
  ): Promise<Entrant> {
    return this.entrants.setEntrantStatus(uow, input);
  }
  setEntrantAttributes(
    uow: UnitOfWork,
    input: {
      readonly entrantId: string;
      readonly attributes: readonly EntrantAttribute[];
    } & AuditContext,
  ): Promise<readonly EntrantAttribute[]> {
    return this.entrants.setEntrantAttributes(uow, input);
  }
  setEntrantSeeds(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly placements: readonly SeedPlacement[];
      readonly allocation: StageAllocation;
      /**
       * Seed of the draw that produced this order, when one did. Recorded so
       * the draw can be replayed and audited — a draw nobody can reproduce is a
       * draw nobody can check.
       */
      readonly drawSeed?: number;
    } & AuditContext,
  ): Promise<readonly Entrant[]> {
    return this.entrants.setEntrantSeeds(uow, input);
  }
  listEntrantAttributes(entrantId: string): Promise<readonly EntrantAttribute[]> {
    return this.entrants.listEntrantAttributes(entrantId);
  }
  listTournamentAttributes(
    tournamentId: string,
  ): Promise<ReadonlyMap<string, readonly EntrantAttribute[]>> {
    return this.entrants.listTournamentAttributes(tournamentId);
  }
  findEntrant(entrantId: string): Promise<Entrant | undefined> {
    return this.entrants.findEntrant(entrantId);
  }
  listEntrants(tournamentId: string): Promise<readonly Entrant[]> {
    return this.entrants.listEntrants(tournamentId);
  }
  private resolveRegistrationAbbreviation(
    executor: Kysely<Database> | Transaction<Database>,
    input: {
      readonly tournamentId: string;
      readonly entrantRef: Entrant['entrantRef'];
      readonly abbreviation?: string;
    },
  ): Promise<string | undefined> {
    return this.entrants.resolveRegistrationAbbreviation(executor, input);
  }
  private derivedEntrantAbbreviation(
    executor: Kysely<Database> | Transaction<Database>,
    entrantRef: Entrant['entrantRef'],
  ): Promise<string | undefined> {
    return this.entrants.derivedEntrantAbbreviation(executor, entrantRef);
  }
  private isEntrantAbbreviationAvailable(
    executor: Kysely<Database> | Transaction<Database>,
    tournamentId: string,
    abbreviation: string,
    excludingEntrantId?: string,
  ): Promise<boolean> {
    return this.entrants.isEntrantAbbreviationAvailable(
      executor,
      tournamentId,
      abbreviation,
      excludingEntrantId,
    );
  }
  listParticipantEntrants(organizationId: string, personId: string): Promise<readonly Entrant[]> {
    return this.participants.listParticipantEntrants(organizationId, personId);
  }
  listParticipantTeamMemberships(
    organizationId: string,
    personId: string,
  ): Promise<readonly ParticipantTeamMembership[]> {
    return this.participants.listParticipantTeamMemberships(organizationId, personId);
  }
  playersByTeams(
    teamIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly { personId: string; playerId: string; role: string }[]>> {
    return this.participants.playersByTeams(teamIds);
  }
  teamsOfPlayers(playerIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.participants.teamsOfPlayers(playerIds);
  }
  clubsOfTeams(teamIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.participants.clubsOfTeams(teamIds);
  }
  listParticipantReportedResults(
    organizationId: string,
    personId: string,
  ): Promise<readonly ParticipantReportedResult[]> {
    return this.participants.listParticipantReportedResults(organizationId, personId);
  }
  isParticipantPartyToMatch(
    organizationId: string,
    personId: string,
    matchId: string,
  ): Promise<boolean> {
    return this.participants.isParticipantPartyToMatch(organizationId, personId, matchId);
  }
  resolveEntrantNames(
    entrantIds: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly name: string; readonly abbreviation?: string }>> {
    return this.names.resolveEntrantNames(entrantIds);
  }
  resolveEntrantPodiumDetails(entrantIds: readonly string[]): Promise<
    ReadonlyMap<
      string,
      {
        readonly name: string;
        readonly abbreviation?: string;
        readonly clubId?: string;
        readonly clubAlias?: string;
        readonly emblemObjectId?: string;
      }
    >
  > {
    return this.names.resolveEntrantPodiumDetails(entrantIds);
  }
}

export type {
  AuditContext,
  ParticipantTeamMembership,
  ParticipantReportedResult,
} from './enrollment/enrollment-support.js';
