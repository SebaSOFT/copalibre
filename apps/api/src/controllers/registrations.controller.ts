import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiCreatedResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import {
  Controller,
  Inject,
  Get,
  Param,
  Query,
  Req,
  Post,
  HttpCode,
  Body,
  Patch,
  Delete,
} from '@nestjs/common';
import { DATABASE } from '../database.token.js';
import type { Kysely } from 'kysely';
import {
  type Database,
  EnrollmentRepository,
  PersonRepository,
  IdentityPrincipalRepository,
  withTransaction,
  InvariantViolationError,
  TournamentRepository,
  OrganizationRepository,
} from '@copalibre/persistence';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import {
  RegistrationResponse,
  ProblemResponse,
  TeamMemberResponse,
  ReviewRegistrationRequest,
  BulkReviewResponse,
  BulkReviewRequest,
  CreatePersonRequest,
  CreateTeamRequest,
  PersonIdentityResponse,
  UpdatePersonIdentityRequest,
  TeamIdentityResponse,
  UpdateTeamIdentityRequest,
  EditTeamMembershipsRequest,
} from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import {
  type Entrant,
  canDecide,
  planBulkReview,
  type ReviewDecision,
  teamMembershipsEditable,
  teamMembershipsApply,
  type PlayerRole,
  isPlayerRole,
  type CheckInWindow,
} from '@copalibre/domain';
import {
  toResponse,
  actorOf,
  authorizationContextOf,
  DEFAULT_TEAM_MEMBERSHIP_ROLE,
} from '../registrations/context.js';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '../http/error-contract.js';
import { applyTeamRoster } from '../registrations/team-roster.js';
import { enforcePolicy } from '../policy/resource-policy.js';

export { applyTeamRoster } from '../registrations/team-roster.js';

/**
 * Registration review.
 *
 * The console's disabled buttons are a courtesy; this is the authority. A tab
 * left open through the check-in deadline still has yesterday's actions
 * enabled, and the only useful place to refuse is where the request lands.
 */
@ApiTags('registrations')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/registrations')
export class RegistrationsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List a tournament’s registrations',
    description:
      'Scoped to the named tournament; another tournament’s entrants are never included.',
  })
  @ApiOkResponse({ type: RegistrationResponse, isArray: true })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async list(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Query('status') status: string | undefined,
    @Req() request: RequestWithSubject,
  ): Promise<RegistrationResponse[]> {
    const { organizationId, tournament } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    const enrollment = new EnrollmentRepository(this.db);
    const entrants = await enrollment.listEntrants(tournament.tournamentId);
    const visible = entrants.filter(
      (entrant) => status === undefined || status === 'all' || entrant.status === status,
    );

    const personIds = visible
      .map((entrant) => entrant.entrantRef)
      .filter(
        (ref): ref is Extract<Entrant['entrantRef'], { kind: 'person' }> => ref.kind === 'person',
      )
      .map((ref) => ref.personId);
    const people = new PersonRepository(this.db);
    const persons = await people.findPersons(personIds);
    const personById = new Map(persons.map((person) => [person.personId, person]));
    const linkedPersonIds = await new IdentityPrincipalRepository(this.db).linkedPersonIds(
      organizationId,
      personIds,
    );
    const entrantLabels = await enrollment.resolveEntrantNames(
      visible.map((entrant) => entrant.entrantId),
    );

    const teamEntrants = visible.filter(
      (entrant): entrant is Entrant & { entrantRef: { kind: 'team'; teamId: string } } =>
        entrant.entrantRef.kind === 'team',
    );
    const teamMembersByTeamId = new Map<string, TeamMemberResponse[]>();
    if (teamEntrants.length > 0) {
      const allTeamSquads = await Promise.all(
        teamEntrants.map(async (te) => ({
          teamId: te.entrantRef.teamId,
          squad: await people.squadOf(te.entrantRef.teamId),
        })),
      );
      const allMemberPersonIds = [
        ...new Set(allTeamSquads.flatMap(({ squad }) => squad.map((p) => p.personId))),
      ];
      const memberPersons = await people.findPersons(allMemberPersonIds);
      const memberPersonById = new Map(memberPersons.map((p) => [p.personId, p]));

      for (const { teamId, squad } of allTeamSquads) {
        teamMembersByTeamId.set(
          teamId,
          squad.map((player) => {
            const person = memberPersonById.get(player.personId);
            return {
              personId: player.personId,
              displayName: person?.displayName ?? 'Unknown',
              role: player.role,
              ...(person?.nationality ? { nationality: person.nationality } : {}),
              ...(person?.photoObjectId ? { photoObjectId: person.photoObjectId } : {}),
            };
          }),
        );
      }
    }

    return visible.map((entrant) =>
      toResponse(entrant, personById, linkedPersonIds, teamMembersByTeamId, entrantLabels),
    );
  }

  @Post(':entrantId/review')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Accept, refuse or withdraw one registration',
    description: 'Audited individually with prior and resulting state.',
  })
  @ApiOkResponse({ type: RegistrationResponse })
  async review(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('entrantId') entrantId: string,
    @Body() body: ReviewRegistrationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<RegistrationResponse> {
    const { organizationId, tournament } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    const enrollment = new EnrollmentRepository(this.db);
    const entrant = await enrollment.findEntrant(entrantId);

    if (!entrant || entrant.tournamentId !== tournament.tournamentId) {
      throw new NotFoundException(`No registration ${entrantId} in this tournament`, {
        errorCode: 'registration-not-found',
      });
    }

    const allowed = canDecide(entrant.status, body.decision);
    if (!allowed.ok)
      throw new ConflictException(allowed.error.message, { errorCode: 'registration-conflict' });

    const updated = await withTransaction(this.db, (uow) =>
      enrollment.setEntrantStatus(uow, {
        entrantId,
        status: body.decision,
        organizationId,
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
        ...(body.reason === undefined ? {} : { reason: body.reason }),
      }),
    );

    return toResponse(updated);
  }

  @Post('bulk-review')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Review several registrations',
    description:
      'One audit row per registration, never one for the batch: "approved 40" does not answer "why is this team in the draw".',
  })
  @ApiOkResponse({ type: BulkReviewResponse })
  async bulkReview(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: BulkReviewRequest,
    @Req() request: RequestWithSubject,
  ): Promise<BulkReviewResponse> {
    const { organizationId, tournament } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    const enrollment = new EnrollmentRepository(this.db);
    const entrants = await enrollment.listEntrants(tournament.tournamentId);
    const plan = planBulkReview(entrants, body.entrantIds, body.decision);

    const applied: RegistrationResponse[] = [];
    for (const item of plan.apply) {
      const updated = await withTransaction(this.db, (uow) =>
        enrollment.setEntrantStatus(uow, {
          entrantId: item.entrantId,
          status: item.decision as ReviewDecision,
          organizationId,
          actor: actorOf(request),
          authorizationContext: (request.subject?.scopes ?? []).join(' '),
          ...(body.reason === undefined ? {} : { reason: body.reason }),
        }),
      );
      applied.push(toResponse(updated));
    }

    return { applied, refused: [...plan.refused] };
  }

  @Post('persons')
  @HttpCode(201)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Register a new person directly, without a CSV file',
    description:
      'The walk-up case a CSV row was never meant for: one person, registered through the same ' +
      'path — PersonRepository.register, then registerEntrant — a CSV row already takes. A ' +
      'person later named again in an imported file, matching on natural key or alias, is ' +
      'recognised rather than duplicated.',
  })
  @ApiCreatedResponse({ type: RegistrationResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  async createPerson(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: CreatePersonRequest,
    @Req() request: RequestWithSubject,
  ): Promise<RegistrationResponse> {
    const { organizationId, tournament } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    const audit = {
      actor: actorOf(request),
      authorizationContext: authorizationContextOf(request),
    };
    try {
      const { entrant, person } = await withTransaction(this.db, async (uow) => {
        const { person } = await new PersonRepository(this.db).register(uow, {
          organizationId,
          displayName: body.displayName,
          ...(body.alias === undefined ? {} : { alias: body.alias }),
          ...(body.naturalKeyKind === undefined || body.naturalKeyValue === undefined
            ? {}
            : { naturalKey: { kind: body.naturalKeyKind, value: body.naturalKeyValue } }),
          ...(body.birthDate === undefined ? {} : { birthDate: body.birthDate }),
          ...audit,
        });
        const entrant = await new EnrollmentRepository(this.db).registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'person', personId: person.personId },
          organizationId,
          ...audit,
        });
        return { entrant, person };
      });
      return toResponse(entrant, new Map([[person.personId, person]]));
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'registration-conflict' });
      throw error;
    }
  }

  @Post('teams')
  @HttpCode(201)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Register a new team directly, without a CSV file',
    description:
      'The late-substitute case a CSV row was never meant for: one team, registered through the ' +
      'same path — EnrollmentRepository.createTeam, then registerEntrant — a CSV row already ' +
      'takes. A team later named again in an imported file, matching on alias, is recognised ' +
      'rather than duplicated.',
  })
  @ApiCreatedResponse({ type: RegistrationResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  async createTeam(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: CreateTeamRequest,
    @Req() request: RequestWithSubject,
  ): Promise<RegistrationResponse> {
    const { organizationId, tournament } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    const audit = {
      actor: actorOf(request),
      authorizationContext: authorizationContextOf(request),
    };
    try {
      const entrant = await withTransaction(this.db, async (uow) => {
        const team = await new EnrollmentRepository(this.db).createTeam(uow, {
          organizationId,
          name: body.name,
          ...(body.alias === undefined ? {} : { alias: body.alias }),
          ...(body.clubId === undefined ? {} : { clubId: body.clubId }),
          ...audit,
        });
        return new EnrollmentRepository(this.db).registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...audit,
        });
      });
      return toResponse(entrant);
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'registration-conflict' });
      throw error;
    }
  }

  @Patch('persons/:personId')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a registered person’s display name or alias',
    description:
      'Corrects the person’s own identity fields in place; their existing entrant registration, ' +
      'roster memberships and history stay attached to the same person.',
  })
  @ApiOkResponse({ type: PersonIdentityResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  async updatePersonIdentity(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('personId') personId: string,
    @Body() body: UpdatePersonIdentityRequest,
    @Req() request: RequestWithSubject,
  ): Promise<PersonIdentityResponse> {
    const { organizationId } = await this.resolve(organizationAlias, tournamentAlias, request);
    const people = new PersonRepository(this.db);
    const existing = await people.findPerson(personId);
    if (!existing || existing.organizationId !== organizationId) {
      throw new NotFoundException(`No person ${personId} in this organization`, {
        errorCode: 'registration-not-found',
      });
    }
    try {
      const person = await withTransaction(this.db, (uow) =>
        people.updateIdentity(uow, {
          personId,
          organizationId,
          ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
          ...(body.alias === undefined ? {} : { alias: body.alias }),
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        }),
      );
      return { personId: person.personId, displayName: person.displayName, alias: person.alias };
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'registration-conflict' });
      throw error;
    }
  }

  @Patch('teams/:teamId')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a registered team’s name or alias',
    description:
      'Corrects the team’s own identity fields in place; its existing entrant registration, ' +
      'roster and history stay attached to the same team.',
  })
  @ApiOkResponse({ type: TeamIdentityResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  async updateTeamIdentity(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('teamId') teamId: string,
    @Body() body: UpdateTeamIdentityRequest,
    @Req() request: RequestWithSubject,
  ): Promise<TeamIdentityResponse> {
    const { organizationId } = await this.resolve(organizationAlias, tournamentAlias, request);
    const enrollment = new EnrollmentRepository(this.db);
    const existing = await enrollment.findTeam(teamId);
    if (!existing || existing.organizationId !== organizationId) {
      throw new NotFoundException(`No team ${teamId} in this organization`, {
        errorCode: 'registration-not-found',
      });
    }
    try {
      const team = await withTransaction(this.db, (uow) =>
        enrollment.updateTeam(uow, {
          teamId,
          organizationId,
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.alias === undefined ? {} : { alias: body.alias }),
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        }),
      );
      return { teamId: team.teamId, name: team.name, alias: team.alias };
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'registration-conflict' });
      throw error;
    }
  }

  @Delete('persons/:personId')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a person who has never been registered anywhere',
    description:
      'Refused by name if the person is registered as an entrant, rostered on a team, has an ' +
      'identity link, or has submitted a report — directing to the workflow that clears it first.',
  })
  @ApiOkResponse({ type: PersonIdentityResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  async removePerson(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('personId') personId: string,
    @Req() request: RequestWithSubject,
  ): Promise<PersonIdentityResponse> {
    const { organizationId } = await this.resolve(organizationAlias, tournamentAlias, request);
    const people = new PersonRepository(this.db);
    const existing = await people.findPerson(personId);
    if (!existing || existing.organizationId !== organizationId) {
      throw new NotFoundException(`No person ${personId} in this organization`, {
        errorCode: 'registration-not-found',
      });
    }
    try {
      await withTransaction(this.db, (uow) =>
        people.remove(uow, {
          personId,
          organizationId,
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        }),
      );
      return {
        personId: existing.personId,
        displayName: existing.displayName,
        alias: existing.alias,
      };
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'registration-conflict' });
      throw error;
    }
  }

  @Delete('teams/:teamId')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a team that has never been registered anywhere',
    description:
      'Refused by name if the team is registered as an entrant or has a rostered player — directing ' +
      'to the workflow that clears it first.',
  })
  @ApiOkResponse({ type: TeamIdentityResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  async removeTeam(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('teamId') teamId: string,
    @Req() request: RequestWithSubject,
  ): Promise<TeamIdentityResponse> {
    const { organizationId } = await this.resolve(organizationAlias, tournamentAlias, request);
    const enrollment = new EnrollmentRepository(this.db);
    const existing = await enrollment.findTeam(teamId);
    if (!existing || existing.organizationId !== organizationId) {
      throw new NotFoundException(`No team ${teamId} in this organization`, {
        errorCode: 'registration-not-found',
      });
    }
    try {
      await withTransaction(this.db, (uow) =>
        enrollment.removeTeam(uow, {
          teamId,
          organizationId,
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        }),
      );
      return { teamId: existing.teamId, name: existing.name, alias: existing.alias };
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, { errorCode: 'registration-conflict' });
      throw error;
    }
  }

  @Post(':entrantId/team-memberships')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a registration’s team memberships',
    description:
      'Refused once check-in has closed for a checked-in entrant, whatever a stale console still offers.',
  })
  @ApiOkResponse({ type: RegistrationResponse })
  async editTeamMemberships(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('entrantId') entrantId: string,
    @Body() body: EditTeamMembershipsRequest,
    @Req() request: RequestWithSubject,
  ): Promise<RegistrationResponse> {
    const { organizationId, tournament } = await this.resolve(
      organizationAlias,
      tournamentAlias,
      request,
    );
    const enrollment = new EnrollmentRepository(this.db);
    const entrant = await enrollment.findEntrant(entrantId);

    if (!entrant || entrant.tournamentId !== tournament.tournamentId) {
      throw new NotFoundException(`No registration ${entrantId} in this tournament`, {
        errorCode: 'registration-not-found',
      });
    }

    const window = await this.checkInWindow(tournament.tournamentId);
    const editable = teamMembershipsEditable(window, entrant.status, new Date().toISOString());
    if (!editable.ok)
      throw new ConflictException(editable.error.message, { errorCode: 'registration-conflict' });

    if (!Array.isArray(body.personIds) && !Array.isArray(body.members)) {
      throw new BadRequestException('A team-membership edit names the people on it', {
        errorCode: 'registration-bad-request',
      });
    }

    const applies = teamMembershipsApply(entrant.entrantRef.kind);
    if (!applies.ok)
      throw new BadRequestException(applies.error.message, {
        errorCode: 'registration-bad-request',
      });
    // Narrowed by the check above: only a 'team' entrant reaches this point.
    const { teamId } = entrant.entrantRef as Extract<Entrant['entrantRef'], { kind: 'team' }>;

    const desiredRoleByPersonId = new Map<string, PlayerRole>();
    if (Array.isArray(body.members)) {
      for (const m of body.members) {
        if (m && typeof m.personId === 'string') {
          const role: PlayerRole = isPlayerRole(m.role) ? m.role : DEFAULT_TEAM_MEMBERSHIP_ROLE;
          desiredRoleByPersonId.set(m.personId, role);
        }
      }
    } else if (Array.isArray(body.personIds)) {
      for (const personId of body.personIds) {
        if (typeof personId === 'string') {
          desiredRoleByPersonId.set(personId, DEFAULT_TEAM_MEMBERSHIP_ROLE);
        }
      }
    }

    const people = new PersonRepository(this.db);
    const desired = [...desiredRoleByPersonId.keys()];
    const named = await people.findPersons(desired);
    // A person id from another organization is not a name we recognise here,
    // and is refused identically to one that does not exist at all.
    const namedById = new Map(
      named
        .filter((person) => person.organizationId === organizationId)
        .map((person) => [person.personId, person]),
    );
    const unknown = desired.filter((personId) => !namedById.has(personId));
    if (unknown.length > 0) {
      throw new NotFoundException(
        `No person in this organization for id(s): ${unknown.join(', ')}`,
        { errorCode: 'registration-not-found' },
      );
    }

    await applyTeamRoster(this.db, people, {
      organizationId,
      teamId,
      desiredRoleByPersonId,
      actor: actorOf(request),
      authorizationContext: (request.subject?.scopes ?? []).join(' '),
    });

    const resultingSquad = await people.squadOf(teamId);
    const resultingPersons = await people.findPersons(
      resultingSquad.map((player) => player.personId),
    );
    const personByIdForTeamMembers = new Map(
      resultingPersons.map((person) => [person.personId, person]),
    );

    return {
      ...toResponse(entrant),
      teamMembers: resultingSquad.map((player) => {
        const person = personByIdForTeamMembers.get(player.personId);
        return {
          personId: player.personId,
          displayName: person?.displayName ?? '',
          role: player.role,
          ...(person?.nationality === undefined ? {} : { nationality: person.nationality }),
          ...(person?.photoObjectId === undefined ? {} : { photoObjectId: person.photoObjectId }),
        };
      }),
    };
  }

  /**
   * The check-in window, read from the tournament's latest ruleset.
   *
   * The wizard writes `registration.requiresCheckIn` and
   * `registration.checkInClosesAt` as overrides when the tournament is created.
   * A tournament that declared neither never locks, which is the correct
   * default for a system that enforces only what the organizer configured.
   */
  private async checkInWindow(tournamentId: string): Promise<CheckInWindow> {
    const ruleset = await new TournamentRepository(this.db).findLatestRuleset(tournamentId);
    return {
      requiresCheckIn: ruleset?.overrides['registration.requiresCheckIn'] === true,
      ...(typeof ruleset?.overrides['registration.checkInClosesAt'] === 'string'
        ? { closesAt: ruleset.overrides['registration.checkInClosesAt'] }
        : {}),
    };
  }

  private async resolve(
    organizationAlias: string,
    tournamentAlias: string,
    request: RequestWithSubject,
  ): Promise<{ readonly organizationId: string; readonly tournament: { tournamentId: string } }> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization) {
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'registration-not-found',
      });
    }

    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: organization.organizationId },
    });

    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament) {
      throw new NotFoundException(`No tournament "${tournamentAlias}" in "${organizationAlias}"`, {
        errorCode: 'registration-not-found',
      });
    }
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: {
        organizationId: organization.organizationId,
        ownerTournamentId: tournament.tournamentId,
      },
    });

    return { organizationId: organization.organizationId, tournament };
  }
}
