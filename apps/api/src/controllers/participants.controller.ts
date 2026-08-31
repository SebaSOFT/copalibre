import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  EnrollmentRepository,
  IdentityPrincipalRepository,
  NotFoundError,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  RequireOrganizationCapability,
  RequireParticipantSelfService,
} from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import {
  LinkParticipantIdentityRequest,
  ParticipantIdentityLinkResponse,
  ParticipantReportedResultResponse,
  ParticipantTeamMembershipResponse,
  RegistrationResponse,
} from '../dto/organization.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';

/** Participant self-service projections, scoped to the identity link resolved by the guard. */
@ApiTags('participants')
@Controller('organizations/:organizationAlias/participant')
export class ParticipantsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('registrations')
  @SecurityPlaneTag('authenticated-interaction')
  @RequireParticipantSelfService()
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the participant's own registrations" })
  @ApiOkResponse({ type: RegistrationResponse, isArray: true })
  async registrations(
    @Param('organizationAlias') alias: string,
    @Req() request: RequestWithSubject,
  ): Promise<RegistrationResponse[]> {
    const { organizationId, personId } = await this.ownedParticipant(alias, request);
    return new EnrollmentRepository(this.db)
      .listParticipantEntrants(organizationId, personId)
      .then((entrants) => entrants.map(toRegistrationResponse));
  }

  @Get('team-memberships')
  @SecurityPlaneTag('authenticated-interaction')
  @RequireParticipantSelfService()
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the participant's own team memberships" })
  @ApiOkResponse({ type: ParticipantTeamMembershipResponse, isArray: true })
  async teamMemberships(
    @Param('organizationAlias') alias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly ParticipantTeamMembershipResponse[]> {
    const { organizationId, personId } = await this.ownedParticipant(alias, request);
    return new EnrollmentRepository(this.db).listParticipantTeamMemberships(
      organizationId,
      personId,
    );
  }

  @Get('reported-results')
  @SecurityPlaneTag('authenticated-interaction')
  @RequireParticipantSelfService()
  @ApiBearerAuth()
  @ApiOperation({ summary: "List results for the participant's own registrations" })
  @ApiOkResponse({ type: ParticipantReportedResultResponse, isArray: true })
  async reportedResults(
    @Param('organizationAlias') alias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly ParticipantReportedResultResponse[]> {
    const { organizationId, personId } = await this.ownedParticipant(alias, request);
    return new EnrollmentRepository(this.db).listParticipantReportedResults(
      organizationId,
      personId,
    );
  }

  private async ownedParticipant(
    alias: string,
    request: RequestWithSubject,
  ): Promise<{ readonly organizationId: string; readonly personId: string }> {
    const organization = await new OrganizationRepository(this.db).findByAlias(alias);
    if (!organization)
      throw new NotFoundException(`No organization with alias "${alias}"`, {
        errorCode: 'participant-not-found',
      });
    enforcePolicy({
      plane: 'authenticated-interaction',
      subject: request.subject,
      resource: {
        organizationId: organization.organizationId,
        ownerParticipantId: request.subject?.participantPersonId,
      },
    });
    const personId = request.subject?.participantPersonId;
    if (!personId)
      throw new ForbiddenException('Subject has no participant identity', {
        errorCode: 'participant-forbidden',
      });
    return {
      organizationId: organization.organizationId,
      personId,
    };
  }
}

/** An administrator may pre-link an existing participant to an email before first login. */
@ApiTags('participants')
@Controller('organizations/:organizationAlias/participants')
export class ParticipantIdentityLinksController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post(':personId/identity-link')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-persons')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pre-link a participant identity by email' })
  @ApiCreatedResponse({ type: ParticipantIdentityLinkResponse })
  async link(
    @Param('organizationAlias') alias: string,
    @Param('personId') personId: string,
    @Body() body: LinkParticipantIdentityRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ParticipantIdentityLinkResponse> {
    const organization = await new OrganizationRepository(this.db).findByAlias(alias);
    if (!organization)
      throw new NotFoundException(`No organization with alias "${alias}"`, {
        errorCode: 'participant-not-found',
      });
    return withTransaction(this.db, (uow) =>
      new IdentityPrincipalRepository(this.db).linkParticipant(uow, {
        organizationId: organization.organizationId,
        personId,
        email: body.email,
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
      }),
    );
  }

  @Delete(':personId/identity-link')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-persons')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a participant identity link',
    description:
      'Frees the person to be linked again; does not delete the person record, their registrations, ' +
      'or their roster history.',
  })
  @ApiOkResponse({ type: ParticipantIdentityLinkResponse })
  async unlink(
    @Param('organizationAlias') alias: string,
    @Param('personId') personId: string,
    @Req() request: RequestWithSubject,
  ): Promise<ParticipantIdentityLinkResponse> {
    const organization = await new OrganizationRepository(this.db).findByAlias(alias);
    if (!organization)
      throw new NotFoundException(`No organization with alias "${alias}"`, {
        errorCode: 'participant-not-found',
      });
    try {
      const link = await withTransaction(this.db, (uow) =>
        new IdentityPrincipalRepository(this.db).unlinkParticipant(uow, {
          organizationId: organization.organizationId,
          personId,
          actor: actorOf(request),
          authorizationContext: (request.subject?.scopes ?? []).join(' '),
        }),
      );
      return { principalId: link.principalId, personId };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new ConflictException(error.message, { errorCode: 'participant-conflict' });
      }
      throw error;
    }
  }
}

function toRegistrationResponse(entrant: {
  entrantId: string;
  tournamentId: string;
  status: RegistrationResponse['status'];
  entrantRef:
    | { readonly kind: 'person'; readonly personId: string }
    | { readonly kind: 'team'; readonly teamId: string };
}): RegistrationResponse {
  return {
    entrantId: entrant.entrantId,
    tournamentId: entrant.tournamentId,
    status: entrant.status,
    ...(entrant.entrantRef.kind === 'person'
      ? { personId: entrant.entrantRef.personId }
      : { teamId: entrant.entrantRef.teamId }),
  };
}

function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.principalId ?? request.subject?.subjectId ?? 'unknown'}`;
}
