import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ConflictException, NotFoundException } from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Kysely } from 'kysely';
import {
  EnrollmentRepository,
  InvariantViolationError,
  OrganizationRepository,
  PersonRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { PlayerRole } from '@copalibre/domain';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import {
  ClubMemberResponse,
  ClubRegistrationResponse,
  ClubTeamResponse,
  CreateClubMemberRequest,
  CreateClubTeamRequest,
  SubmitClubRegistrationRequest,
  UpdateClubMemberRequest,
} from '../dto/club-portal.dto.js';
import { applyTeamRoster } from './registrations.controller.js';

/**
 * The Club Portal (openspec 0301): a `club-admin`'s self-service surface over
 * their own club's member directory and tournament roster submissions.
 *
 * No new guard class. `OrganizationAccessGuard` already admits the caller by
 * capability (`org.manage-club-members`) and sets `request.subject.resourceScope.clubId`
 * from their role assignment; every method here narrows to its own `:clubId`
 * the same way `ClubsController.update`/`ClubMediaController.uploadEmblem`
 * already do, via `enforcePolicy({ plane: 'admin-control', resource: { organizationId, ownerClubId } })`.
 */
@ApiTags('club-portal')
@Controller('organizations/:organizationAlias/clubs/:clubId')
export class ClubPortalController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('members')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-club-members')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List a club's own member directory" })
  @ApiOkResponse({ type: ClubMemberResponse, isArray: true })
  async listMembers(
    @Param('organizationAlias') organizationAlias: string,
    @Param('clubId') clubId: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly ClubMemberResponse[]> {
    const { organizationId } = await this.resolveClub(organizationAlias, clubId, request);
    const persons = await new PersonRepository(this.db).listByClub(organizationId, clubId);
    return persons.map(toMemberResponse);
  }

  @Post('members')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-club-members')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a new person to the club member directory' })
  @ApiCreatedResponse({ type: ClubMemberResponse })
  async createMember(
    @Param('organizationAlias') organizationAlias: string,
    @Param('clubId') clubId: string,
    @Body() body: CreateClubMemberRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ClubMemberResponse> {
    const { organizationId } = await this.resolveClub(organizationAlias, clubId, request);
    const subject = request.subject;
    try {
      const { person } = await withTransaction(this.db, (uow) =>
        new PersonRepository(this.db).register(uow, {
          organizationId,
          displayName: body.displayName,
          clubId,
          ...(body.alias === undefined ? {} : { alias: body.alias }),
          ...(body.birthDate === undefined ? {} : { birthDate: body.birthDate }),
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
      return toMemberResponse(person);
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'club-portal-conflict' });
      throw error;
    }
  }

  @Patch('members/:personId')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-club-members')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Edit a club member's display name or alias" })
  @ApiOkResponse({ type: ClubMemberResponse })
  async updateMember(
    @Param('organizationAlias') organizationAlias: string,
    @Param('clubId') clubId: string,
    @Param('personId') personId: string,
    @Body() body: UpdateClubMemberRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ClubMemberResponse> {
    const { organizationId } = await this.resolveClub(organizationAlias, clubId, request);
    const people = new PersonRepository(this.db);
    const existing = await people.findPerson(personId);
    if (!existing || existing.organizationId !== organizationId || existing.clubId !== clubId) {
      throw new NotFoundException(`No member "${personId}" in this club`, {
        errorCode: 'club-portal-not-found',
      });
    }
    const subject = request.subject;
    try {
      const person = await withTransaction(this.db, (uow) =>
        people.updateIdentity(uow, {
          personId,
          organizationId,
          ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
          ...(body.alias === undefined ? {} : { alias: body.alias }),
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
      return toMemberResponse(person);
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'club-portal-conflict' });
      throw error;
    }
  }

  @Get('teams')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-club-members')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the club's own teams" })
  @ApiOkResponse({ type: ClubTeamResponse, isArray: true })
  async listTeams(
    @Param('organizationAlias') organizationAlias: string,
    @Param('clubId') clubId: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly ClubTeamResponse[]> {
    const { organizationId } = await this.resolveClub(organizationAlias, clubId, request);
    const teams = await new EnrollmentRepository(this.db).listTeamsByClub(organizationId, clubId);
    return teams.map((team) => ({ teamId: team.teamId, name: team.name, alias: team.alias }));
  }

  @Post('teams')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-club-members')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a team owned by this club' })
  @ApiCreatedResponse({ type: ClubTeamResponse })
  async createTeam(
    @Param('organizationAlias') organizationAlias: string,
    @Param('clubId') clubId: string,
    @Body() body: CreateClubTeamRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ClubTeamResponse> {
    const { organizationId } = await this.resolveClub(organizationAlias, clubId, request);
    const subject = request.subject;
    try {
      const team = await withTransaction(this.db, (uow) =>
        new EnrollmentRepository(this.db).createTeam(uow, {
          organizationId,
          clubId,
          name: body.name,
          ...(body.alias === undefined ? {} : { alias: body.alias }),
          actor: `user:${subject?.subjectId ?? 'unknown'}`,
          authorizationContext: (subject?.scopes ?? []).join(' '),
        }),
      );
      return { teamId: team.teamId, name: team.name, alias: team.alias };
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'club-portal-conflict' });
      throw error;
    }
  }

  @Post('tournaments/:tournamentAlias/registrations')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-club-members')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Submit the club's team as a pending tournament registration with its squad",
    description:
      'Registers the named team as a pending entrant (organizer review, unchanged, decides the ' +
      'rest) and applies the submitted squad in the same transaction. Every named person must ' +
      "already be one of the club's own members.",
  })
  @ApiCreatedResponse({ type: ClubRegistrationResponse })
  async submitRegistration(
    @Param('organizationAlias') organizationAlias: string,
    @Param('clubId') clubId: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: SubmitClubRegistrationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ClubRegistrationResponse> {
    const { organizationId } = await this.resolveClub(organizationAlias, clubId, request);

    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament) {
      throw new NotFoundException(`No tournament "${tournamentAlias}" in "${organizationAlias}"`, {
        errorCode: 'club-portal-not-found',
      });
    }

    const enrollment = new EnrollmentRepository(this.db);
    const team = await enrollment.findTeam(body.teamId);
    if (!team || team.organizationId !== organizationId || team.clubId !== clubId) {
      throw new NotFoundException(`No team "${body.teamId}" in this club`, {
        errorCode: 'club-portal-not-found',
      });
    }

    const people = new PersonRepository(this.db);
    const desired = body.members.map((member) => member.personId);
    const members = await people.findPersons(desired);
    const notOwnMember = desired.filter(
      (personId) =>
        !members.some((person) => person.personId === personId && person.clubId === clubId),
    );
    if (notOwnMember.length > 0) {
      throw new NotFoundException(`Not a member of this club: ${notOwnMember.join(', ')}`, {
        errorCode: 'club-portal-not-found',
      });
    }

    const desiredRoleByPersonId = new Map<string, PlayerRole>(
      body.members.map((member) => [member.personId, member.role ?? 'player']),
    );

    const subject = request.subject;
    const actor = `user:${subject?.subjectId ?? 'unknown'}`;
    const authorizationContext = (subject?.scopes ?? []).join(' ');

    const entrant = await withTransaction(this.db, (uow) =>
      enrollment.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: body.teamId },
        organizationId,
        actor,
        authorizationContext,
      }),
    );
    await applyTeamRoster(this.db, people, {
      organizationId,
      teamId: body.teamId,
      desiredRoleByPersonId,
      actor,
      authorizationContext,
    });

    return {
      entrantId: entrant.entrantId,
      tournamentId: entrant.tournamentId,
      status: entrant.status,
      teamId: body.teamId,
    };
  }

  /**
   * Resolves the organization and club, and enforces that the caller's own
   * scoped club (a `club-admin`'s `resourceScope.clubId`) matches `:clubId` —
   * a no-op pass for an unscoped `admin`, a 403 for a `club-admin` scoped to a
   * different club. Mirrors `ClubsController.update`.
   */
  private async resolveClub(
    organizationAlias: string,
    clubId: string,
    request: RequestWithSubject,
  ): Promise<{ readonly organizationId: string }> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'club-portal-not-found',
      });
    }
    const club = await new EnrollmentRepository(this.db).findClub(clubId);
    if (!club || club.organizationId !== organization.organizationId) {
      throw new NotFoundException(`No club "${clubId}" in this organization`, {
        errorCode: 'club-portal-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: organization.organizationId, ownerClubId: clubId },
    });
    return { organizationId: organization.organizationId };
  }
}

function toMemberResponse(person: {
  readonly personId: string;
  readonly displayName: string;
  readonly alias?: string;
  readonly birthDate?: string;
  readonly nationality?: string;
  readonly photoObjectId?: string;
}): ClubMemberResponse {
  return {
    personId: person.personId,
    displayName: person.displayName,
    ...(person.alias === undefined ? {} : { alias: person.alias }),
    ...(person.birthDate === undefined ? {} : { birthDate: person.birthDate }),
    ...(person.nationality === undefined ? {} : { nationality: person.nationality }),
    ...(person.photoObjectId === undefined ? {} : { photoObjectId: person.photoObjectId }),
  };
}
