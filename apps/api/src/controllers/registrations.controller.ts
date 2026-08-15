import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  SUPPORTED_FORMATS,
  canDecide,
  planBulkReview,
  planRosterReconciliation,
  teamMembershipsApply,
  teamMembershipsEditable,
  type CheckInWindow,
  type Entrant,
  type PlayerRole,
  type ReviewDecision,
} from '@copalibre/domain';
import {
  EnrollmentRepository,
  OrganizationRepository,
  PersonRepository,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import {
  BulkReviewRequest,
  BulkReviewResponse,
  DisciplineSummaryResponse,
  EditTeamMembershipsRequest,
  ProblemResponse,
  RegistrationResponse,
  ReviewRegistrationRequest,
} from '../dto/organization.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { DATABASE } from '../database.token.js';

/**
 * A team-membership edit's request body carries no per-person role —
 * extending it to `{ personId, role }[]` is a larger, separable change this
 * endpoint's gap did not ask for. 'player' is the unmarked, common-case
 * membership; reconciliation only adds and removes, so this default cannot
 * demote an existing coach or substitute named again in a later edit.
 */
const DEFAULT_TEAM_MEMBERSHIP_ROLE: PlayerRole = 'player';

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
  @RequireOrganizationRole('admin')
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
    const { tournament } = await this.resolve(organizationAlias, tournamentAlias, request);
    const entrants = await new EnrollmentRepository(this.db).listEntrants(tournament.tournamentId);

    return entrants
      .filter((entrant) => status === undefined || status === 'all' || entrant.status === status)
      .map(toResponse);
  }

  @Post(':entrantId/review')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
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
      throw new NotFoundException(`No registration ${entrantId} in this tournament`);
    }

    const allowed = canDecide(entrant.status, body.decision);
    if (!allowed.ok) throw new ConflictException(allowed.error.message);

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
  @RequireOrganizationRole('admin')
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

  @Post(':entrantId/team-memberships')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
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
      throw new NotFoundException(`No registration ${entrantId} in this tournament`);
    }

    const window = await this.checkInWindow(tournament.tournamentId);
    const editable = teamMembershipsEditable(window, entrant.status, new Date().toISOString());
    if (!editable.ok) throw new ConflictException(editable.error.message);

    if (!Array.isArray(body.personIds)) {
      throw new BadRequestException('A team-membership edit names the people on it');
    }

    const applies = teamMembershipsApply(entrant.entrantRef.kind);
    if (!applies.ok) throw new BadRequestException(applies.error.message);
    // Narrowed by the check above: only a 'team' entrant reaches this point.
    const { teamId } = entrant.entrantRef as Extract<Entrant['entrantRef'], { kind: 'team' }>;

    const people = new PersonRepository(this.db);
    const desired = [...new Set(body.personIds)];
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
      );
    }

    const currentSquad = await people.squadOf(teamId);
    const plan = planRosterReconciliation(
      currentSquad.map((player) => player.personId),
      desired,
    );
    const playerIdByPersonId = new Map(currentSquad.map((player) => [player.personId, player]));

    await withTransaction(this.db, async (uow) => {
      for (const personId of plan.toEnlist) {
        await people.enlist(uow, {
          personId,
          teamId,
          role: DEFAULT_TEAM_MEMBERSHIP_ROLE,
          organizationId,
          actor: actorOf(request),
          authorizationContext: (request.subject?.scopes ?? []).join(' '),
        });
      }
      for (const personId of plan.toRemove) {
        const player = playerIdByPersonId.get(personId);
        if (!player) continue;
        await people.dismiss(uow, {
          playerId: player.playerId,
          organizationId,
          actor: actorOf(request),
          authorizationContext: (request.subject?.scopes ?? []).join(' '),
        });
      }
    });

    const resultingSquad = await people.squadOf(teamId);
    const resultingPersons = await people.findPersons(
      resultingSquad.map((player) => player.personId),
    );
    const displayNameByPersonId = new Map(
      resultingPersons.map((person) => [person.personId, person.displayName]),
    );

    return {
      ...toResponse(entrant),
      teamMembers: resultingSquad.map((player) => ({
        personId: player.personId,
        displayName: displayNameByPersonId.get(player.personId) ?? '',
        role: player.role,
      })),
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
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`);
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
      throw new NotFoundException(`No tournament "${tournamentAlias}" in "${organizationAlias}"`);
    }

    return { organizationId: organization.organizationId, tournament };
  }
}

/** The disciplines a wizard may choose from, with the formats each declares. */
@ApiTags('disciplines')
@Controller('disciplines')
export class DisciplinesController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'List installed disciplines and the formats they support',
    description:
      'The wizard filters formats from this response. A client-side list disagrees with the installation the day a module is added.',
  })
  @ApiOkResponse({ type: DisciplineSummaryResponse, isArray: true })
  async list(): Promise<DisciplineSummaryResponse[]> {
    const descriptors = await new TournamentRepository(this.db).listDescriptors();

    return descriptors.map((descriptor) => ({
      descriptorId: descriptor.descriptorId,
      version: descriptor.version,
      name: descriptor.document.name,
      // The descriptor's own list, filtered to what the engine actually supports:
      // a discipline may not advertise a format nothing can generate.
      supportedFormats: descriptor.document.availableFormats.filter((format) =>
        (SUPPORTED_FORMATS as readonly string[]).includes(format),
      ),
    }));
  }
}

function toResponse(entrant: Entrant): RegistrationResponse {
  return {
    entrantId: entrant.entrantId,
    tournamentId: entrant.tournamentId,
    status: entrant.status,
    ...(entrant.entrantRef.kind === 'team'
      ? { teamId: entrant.entrantRef.teamId }
      : { personId: entrant.entrantRef.personId }),
  };
}

function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.subjectId ?? 'unknown'}`;
}
