import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Headers, Header, Inject, Post } from '@nestjs/common';
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '../http/error-contract.js';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  InvariantViolationError,
  InstallationBootstrapRepository,
  type BootstrapAdministratorResult,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import {
  BootstrapAdministratorRequest,
  BootstrapAdministratorResponse,
  ProblemResponse,
} from '../dto/organization.dto.js';

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The only unauthenticated application route. It is a zero-state capability
 * endpoint, protected by a one-time operator secret rather than an OIDC token
 * because no identity exists before this request completes.
 */
@ApiTags('installation-bootstrap')
@Controller('installation/bootstrap')
export class InstallationBootstrapController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post('admin')
  @Header('Cache-Control', 'no-store')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'Create first organization administrator',
    description:
      'Available only before the installation contains an organization. Requires the out-of-band bootstrap secret and returns a one-time OIDC invitation setup link.',
  })
  @ApiHeader({
    name: 'x-copalibre-bootstrap-token',
    required: true,
    description: 'Operator-provided bootstrap secret. Never store this in browser code.',
  })
  @ApiCreatedResponse({ type: BootstrapAdministratorResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async createAdmin(
    @Body() body: BootstrapAdministratorRequest,
    @Headers('x-copalibre-bootstrap-token') token: string | undefined,
  ): Promise<BootstrapAdministratorResponse> {
    const configuredToken = process.env.COPALIBRE_BOOTSTRAP_TOKEN;
    if (!configuredToken || !token || !tokensMatch(configuredToken, token)) {
      throw new ForbiddenException('Bootstrap token is invalid', {
        errorCode: 'installation-bootstrap-forbidden',
      });
    }
    const invitationToken = randomBytes(32).toString('base64url');
    let result: BootstrapAdministratorResult;
    try {
      result = await withTransaction(this.db, (uow) =>
        new InstallationBootstrapRepository(this.db).createInitialAdministrator(uow, {
          organizationAlias: body.organizationAlias,
          organizationName: body.organizationName,
          email: body.email,
          invitationToken,
          invitationTokenHash: hash(invitationToken),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS).toISOString(),
        }),
      );
    } catch (error) {
      if (error instanceof InvariantViolationError)
        throw new ConflictException(error.message, {
          errorCode: 'installation-bootstrap-conflict',
        });
      throw error;
    }
    return { ...result, setupUrl: setupUrl(invitationToken) };
  }
}

function tokensMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function setupUrl(token: string): string {
  const appUrl = process.env.COPALIBRE_APP_URL;
  if (!appUrl)
    throw new ServiceUnavailableException('COPALIBRE_APP_URL is not configured', {
      errorCode: 'installation-bootstrap-service-unavailable',
    });
  const url = new URL('/invitations/accept', appUrl);
  url.searchParams.set('token', token);
  return url.toString();
}
