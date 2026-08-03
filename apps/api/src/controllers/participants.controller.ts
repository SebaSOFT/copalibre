import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
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
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  RequireOrganizationRole,
  RequireParticipantSelfService,
} from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import {
  LinkParticipantIdentityRequest,
  ParticipantIdentityLinkResponse,
  ParticipantReportedResultResponse,
  ParticipantRosterResponse,
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

  @Get('roster')
  @SecurityPlaneTag('authenticated-interaction')
  @RequireParticipantSelfService()
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the participant's own team memberships" })
  @ApiOkResponse({ type: ParticipantRosterResponse, isArray: true })
  async roster(
    @Param('organizationAlias') alias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly ParticipantRosterResponse[]> {
    const { organizationId, personId } = await this.ownedParticipant(alias, request);
    return new EnrollmentRepository(this.db).listParticipantRoster(organizationId, personId);
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
    if (!organization) throw new NotFoundException(`No organization with alias "${alias}"`);
    enforcePolicy({
      plane: 'authenticated-interaction',
      subject: request.subject,
      resource: {
        organizationId: organization.organizationId,
        ownerParticipantId: request.subject?.participantPersonId,
      },
    });
    const personId = request.subject?.participantPersonId;
    if (!personId) throw new ForbiddenException('Subject has no participant identity');
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
  @RequireOrganizationRole('admin')
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
    if (!organization) throw new NotFoundException(`No organization with alias "${alias}"`);
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
