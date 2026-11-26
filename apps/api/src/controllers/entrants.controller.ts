import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { Controller, Inject, Patch, Param, Body, Req, Get } from '@nestjs/common';
import { DATABASE } from '../database.token.js';
import type { Kysely } from 'kysely';
import {
  type Database,
  EnrollmentRepository,
  withTransaction,
  OrganizationRepository,
  TournamentRepository,
} from '@copalibre/persistence';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import {
  RegistrationResponse,
  ProblemResponse,
  SetEntrantAbbreviationRequest,
} from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '../http/error-contract.js';
import { actorOf, toResponse } from '../registrations/context.js';
import { enforcePolicy } from '../policy/resource-policy.js';

@ApiTags('entrants')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/entrants')
export class EntrantsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Patch(':entrantId/abbreviation')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set one entrant’s tournament-scoped abbreviation' })
  @ApiOkResponse({ type: RegistrationResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async setAbbreviation(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('entrantId') entrantId: string,
    @Body() body: SetEntrantAbbreviationRequest,
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
    try {
      const updated = await withTransaction(this.db, (uow) =>
        enrollment.setEntrantAbbreviation(uow, {
          entrantId,
          abbreviation: body.abbreviation,
          organizationId,
          actor: actorOf(request),
          authorizationContext: (request.subject?.scopes ?? []).join(' '),
        }),
      );
      return toResponse(updated);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already used'))
          throw new ConflictException(error.message, { errorCode: 'registration-conflict' });
        if (error.message.toLowerCase().includes('abbreviation')) {
          throw new BadRequestException(error.message, { errorCode: 'registration-bad-request' });
        }
      }
      throw error;
    }
  }

  @Get('needing-abbreviation')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-registrations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List entrants awaiting an officer-chosen abbreviation' })
  @ApiOkResponse({ type: RegistrationResponse, isArray: true })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async needingAbbreviation(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<RegistrationResponse[]> {
    const { tournament } = await this.resolve(organizationAlias, tournamentAlias, request);
    return (
      await new EnrollmentRepository(this.db).listEntrantsNeedingAbbreviation(
        tournament.tournamentId,
      )
    ).map((entrant) => toResponse(entrant));
  }

  private async resolve(
    organizationAlias: string,
    tournamentAlias: string,
    request: RequestWithSubject,
  ): Promise<{ readonly organizationId: string; readonly tournament: { tournamentId: string } }> {
    const organization = await new OrganizationRepository(this.db).findByAlias(organizationAlias);
    if (!organization)
      throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
        errorCode: 'registration-not-found',
      });
    enforcePolicy({
      plane: 'admin-control',
      subject: request.subject,
      resource: { organizationId: organization.organizationId },
    });
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament)
      throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
        errorCode: 'registration-not-found',
      });
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
