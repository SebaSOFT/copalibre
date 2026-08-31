import { createHash, randomBytes } from 'node:crypto';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ServiceUnavailableException } from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DisplayTokenRepository, withTransaction, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import {
  DisplayTokenIssuedResponse,
  DisplayTokenResponse,
  IssueDisplayTokenRequest,
} from '../dto/broadcast.dto.js';
import { resolveTournament } from './standings.controller.js';

/**
 * Device-scoped display-token issuance and revocation for `/tv/**` surfaces.
 * Operator-authenticated, organization-admin-only — a kiosk never
 * authenticates as a person, so this is the only path a token for it exists.
 */
@ApiTags('broadcast')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/display-tokens')
export class DisplayTokenController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-display-tokens')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List display tokens issued for this tournament’s /tv/** surfaces' })
  @ApiOkResponse({ type: DisplayTokenResponse, isArray: true })
  async list(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly DisplayTokenResponse[]> {
    const { organizationId, tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });
    const tokens = await new DisplayTokenRepository(this.db).listByOrganization(organizationId);
    return tokens.filter((token) => token.tournamentId === tournament.tournamentId).map(toResponse);
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-display-tokens')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Issue a device-scoped display token for one /tv/** route' })
  @ApiCreatedResponse({
    type: DisplayTokenIssuedResponse,
    description: 'Shown once — provision the device with it, it is stored only as a hash',
  })
  async issue(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: IssueDisplayTokenRequest,
    @Req() request: RequestWithSubject,
  ): Promise<DisplayTokenIssuedResponse> {
    const { organizationId, tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });
    const token = randomBytes(32).toString('base64url');
    const issued = await withTransaction(this.db, (uow) =>
      new DisplayTokenRepository(this.db).issue(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        tokenHash: hash(token),
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
        ...(body.matchId === undefined ? {} : { matchId: body.matchId }),
        ...(body.label === undefined ? {} : { label: body.label }),
      }),
    );
    return {
      displayTokenId: issued.displayTokenId,
      token,
      url: launchUrl(organizationAlias, tournamentAlias, body.matchId, token),
      ...(issued.label === undefined ? {} : { label: issued.label }),
    };
  }

  @Delete(':displayTokenId')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-display-tokens')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke one device’s display token' })
  @ApiOkResponse({ type: DisplayTokenResponse })
  async revoke(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('displayTokenId') displayTokenId: string,
    @Req() request: RequestWithSubject,
  ): Promise<DisplayTokenResponse> {
    const { organizationId } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });
    const revoked = await withTransaction(this.db, (uow) =>
      new DisplayTokenRepository(this.db).revoke(uow, {
        displayTokenId,
        organizationId,
        actor: actorOf(request),
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
      }),
    );
    return toResponse(revoked);
  }
}

function toResponse(token: {
  readonly displayTokenId: string;
  readonly tournamentId: string;
  readonly matchId?: string;
  readonly label?: string;
  readonly revoked: boolean;
  readonly lastSeenAt?: string;
  readonly createdAt: string;
}): DisplayTokenResponse {
  return {
    displayTokenId: token.displayTokenId,
    tournamentId: token.tournamentId,
    revoked: token.revoked,
    createdAt: token.createdAt,
    ...(token.matchId === undefined ? {} : { matchId: token.matchId }),
    ...(token.label === undefined ? {} : { label: token.label }),
    ...(token.lastSeenAt === undefined ? {} : { lastSeenAt: token.lastSeenAt }),
  };
}

/**
 * The device's launch URL, token included as a query parameter — a
 * provisioning-time credential a kiosk is configured with once, not a
 * repeatedly-transmitted access token, the same class as the invitation
 * setup link this mirrors. The actual SSE request the page makes sends the
 * token as an Authorization header, never a URL, same as every other stream.
 */
function launchUrl(
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string | undefined,
  token: string,
): string {
  const appUrl = process.env.COPALIBRE_APP_URL;
  if (!appUrl)
    throw new ServiceUnavailableException('COPALIBRE_APP_URL is not configured', {
      errorCode: 'broadcast-service-unavailable',
    });
  const path = matchId
    ? `/tv/${organizationAlias}/tournaments/${tournamentAlias}/matches/${matchId}`
    : `/tv/${organizationAlias}/tournaments/${tournamentAlias}`;
  const url = new URL(path, appUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function actorOf(request: RequestWithSubject): string {
  return `user:${request.subject?.principalId ?? request.subject?.subjectId ?? 'unknown'}`;
}
