import * as argon2 from 'argon2';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importPKCS8, SignJWT } from 'jose';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '../http/error-contract.js';
import { NotFoundError } from '@copalibre/persistence';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Kysely } from 'kysely';
import {
  IdentityPrincipalRepository,
  InstallationRoleRepository,
  OrganizationAccessRepository,
  PersonalAccessTokenRepository,
  AuthVerificationTokenRepository,
  withTransaction,
  SYSTEM_ORGANIZATION,
  type Database,
} from '@copalibre/persistence';
import { PRIVILEGED_SCOPES, RequireSelf, SUPER_ADMIN_SCOPE } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { SharedThrottle } from '../auth/shared-throttle.decorator.js';
import { Throttle } from '@nestjs/throttler';
import { DATABASE } from '../database.token.js';
import {
  LoginRequest,
  LoginResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  CreatePatRequest,
  PatCreatedResponse,
  PatResponse,
  AuthSuccessResponse,
  NativeAcceptInvitationRequest,
  JwksResponse,
} from '../dto/auth.dto.js';

/**
 * Per-IP rate limit for the unauthenticated, brute-forceable endpoints
 *: tight enough to blunt automated guessing, generous
 * enough that a real user retrying a mistyped password or re-requesting a
 * reset email once or twice never notices. Keyed by client IP — see
 * main.ts's trustProxy note for why that is the real client behind this
 * deployment's reverse proxy.
 */
export const AUTH_THROTTLE_LIMIT = 5;
export const AUTH_THROTTLE_TTL_MS = 60_000;

/**
 * Native-login session refresh (openspec 0302). Only native (email/password)
 * sessions get this cookie — an OIDC session's token is issued and refreshed
 * by the external identity provider, never by this API, so it never carries
 * this cookie. `HttpOnly` keeps it out of every browser-storage surface
 * `token-store.ts`'s `FORBIDDEN_STORAGE_KEYS` already forbids; hand-rolled
 * rather than a `@fastify/cookie` dependency, since one cookie with fixed
 * attributes is a few lines, not a plugin's worth of surface.
 */
export const REFRESH_COOKIE_NAME = 'copalibre_refresh_token';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function serializeRefreshCookie(value: string, maxAgeSeconds: number): string {
  const attributes = [
    `${REFRESH_COOKIE_NAME}=${value}`,
    'Path=/auth',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes.join('; ');
}

function readRefreshCookie(req: FastifyRequest): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === REFRESH_COOKIE_NAME) return rawValue.join('=');
  }
  return undefined;
}

/**
 * Native authentication endpoints: local email/password login, forgot
 * password, and password reset. These are public-read endpoints — they
 * do not require a pre-existing JWT.
 */
@ApiTags('auth')
@Controller('auth')
export class NativeAuthController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ type: LoginResponse })
  async login(
    @Body() body: LoginRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    // Check if principal exists
    const principal = await this.db
      .selectFrom('identity_principals')
      .selectAll()
      .where('email', '=', body.email.toLowerCase().trim())
      .executeTakeFirst();

    if (!principal?.password_hash) {
      throw new UnauthorizedException('Invalid email or password', {
        errorCode: 'auth-unauthorized',
      });
    }

    const valid = await argon2.verify(principal.password_hash, body.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password', {
        errorCode: 'auth-unauthorized',
      });
    }

    const accessToken = await issueLocalJwt(this.db, principal.principal_id, principal.email);
    await this.issueRefreshCookie(res, principal.principal_id);
    return { accessToken, expiresIn: 3600 };
  }

  /** Shared by `login`, `acceptInvitation` and `refresh` — every point a native session begins or renews. */
  private async issueRefreshCookie(res: FastifyReply, principalId: string): Promise<void> {
    const { rawToken } = await withTransaction(this.db, (uow) =>
      new AuthVerificationTokenRepository(this.db).create(uow, {
        principalId,
        kind: 'session-refresh',
        ttlMs: REFRESH_TOKEN_TTL_MS,
      }),
    );
    res.header(
      'Set-Cookie',
      serializeRefreshCookie(rawToken, Math.floor(REFRESH_TOKEN_TTL_MS / 1000)),
    );
  }

  @Get('jwks.json')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'JSON Web Key Set for local token verification' })
  @ApiOkResponse({ type: JwksResponse })
  jwks(): { readonly keys: readonly Record<string, unknown>[] } {
    return getLocalKeys().jwks;
  }

  @Post('accept-invitation')
  @HttpCode(200)
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Accept invitation and set password for administrator' })
  @ApiOkResponse({ type: LoginResponse })
  async acceptInvitation(
    @Body() body: NativeAcceptInvitationRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    if (!body.password || body.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters', {
        errorCode: 'auth-bad-request',
      });
    }

    const tokenHash = createHash('sha256').update(body.token).digest('hex');

    const invitation = await this.db
      .selectFrom('organization_invites')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    if (!invitation) {
      throw new NotFoundException('Invitation not found or invalid token', {
        errorCode: 'auth-not-found',
      });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      throw new BadRequestException('Invitation has expired', {
        errorCode: 'auth-bad-request',
      });
    }

    if (invitation.status !== 'pending' && invitation.status !== 'active') {
      throw new BadRequestException('Invitation is no longer active', {
        errorCode: 'auth-bad-request',
      });
    }

    const passwordHash = await argon2.hash(body.password);
    const email = invitation.recipient_email.toLowerCase().trim();

    const principal = await withTransaction(this.db, async (uow) => {
      let p = await new IdentityPrincipalRepository(this.db).findByEmail(email);
      if (!p) {
        p = await new IdentityPrincipalRepository(this.db).create(uow, {
          email,
          passwordHash,
          name: body.name,
        });
      } else {
        await uow.tx
          .updateTable('identity_principals')
          .set({ password_hash: passwordHash, updated_at: new Date() })
          .where('principal_id', '=', p.principalId)
          .execute();
      }

      await new OrganizationAccessRepository(this.db).acceptInvitation(uow, {
        tokenHash,
        subjectId: p.principalId,
        verifiedEmail: email,
        name: body.name,
        actor: `principal:${p.principalId}`,
        authorizationContext: 'invitation-acceptance',
      });

      return p;
    });

    const accessToken = await issueLocalJwt(
      this.db,
      principal.principalId,
      email,
      invitation.organization_id,
    );
    await this.issueRefreshCookie(res, principal.principalId);
    return { accessToken, expiresIn: 3600 };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Silently renew a native session from its refresh cookie' })
  @ApiOkResponse({ type: LoginResponse })
  async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponse> {
    const rawToken = readRefreshCookie(req);
    if (!rawToken) {
      throw new UnauthorizedException('No refresh session present', {
        errorCode: 'auth-unauthorized',
      });
    }

    let principalId: string;
    try {
      const consumed = await withTransaction(this.db, (uow) =>
        new AuthVerificationTokenRepository(this.db).consume(uow, rawToken),
      );
      if (consumed.kind !== 'session-refresh') {
        throw new UnauthorizedException('Invalid refresh session', {
          errorCode: 'auth-unauthorized',
        });
      }
      principalId = consumed.principalId;
    } catch (error) {
      if (error instanceof NotFoundError) {
        // Reuse of an already-consumed (or expired, or never-issued) token —
        // the same signal a stolen-and-replayed token would produce.
        throw new UnauthorizedException('Refresh session is invalid or expired', {
          errorCode: 'auth-unauthorized',
        });
      }
      throw error;
    }

    const principal = await new IdentityPrincipalRepository(this.db).findByOidcSubject(principalId);
    if (!principal) {
      throw new UnauthorizedException('Principal no longer exists', {
        errorCode: 'auth-unauthorized',
      });
    }

    const accessToken = await issueLocalJwt(this.db, principal.principalId, principal.email);
    // Rotates: the just-consumed token can never be presented again, and this
    // fresh one is the only one now valid — replaying an old one always 401s.
    await this.issueRefreshCookie(res, principal.principalId);
    return { accessToken, expiresIn: 3600 };
  }

  @Post('logout')
  @HttpCode(200)
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'End a native session, revoking its refresh cookie' })
  @ApiOkResponse({ type: AuthSuccessResponse })
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<AuthSuccessResponse> {
    const rawToken = readRefreshCookie(req);
    if (rawToken) {
      try {
        await withTransaction(this.db, (uow) =>
          new AuthVerificationTokenRepository(this.db).consume(uow, rawToken),
        );
      } catch (error) {
        // Already consumed, expired, or unknown — logout still clears the
        // cookie either way, so this is not a failure worth surfacing.
        if (!(error instanceof NotFoundError)) throw error;
      }
    }
    res.header('Set-Cookie', serializeRefreshCookie('', 0));
    return { message: 'Logged out.' };
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiOkResponse({ type: AuthSuccessResponse })
  async forgotPassword(@Body() body: ForgotPasswordRequest): Promise<AuthSuccessResponse> {
    const email = body.email.toLowerCase().trim();
    const principal = await new IdentityPrincipalRepository(this.db).findByEmail(email);

    // Always return success to prevent email enumeration.
    if (!principal) return { message: 'If the email exists, a reset link has been sent.' };

    await withTransaction(this.db, async (uow) => {
      const created = await new AuthVerificationTokenRepository(this.db).create(uow, {
        principalId: principal.principalId,
        kind: 'password-reset',
        ttlMs: 60 * 60 * 1000, // 1 hour
      });
      // Delivered by apps/worker's passwordResetEmailHandler (password-reset-requested),
      // the same outbox pattern organization.invite.requested already uses.
      // Password resets are principal-scoped, not organization-scoped, so this
      // uses SYSTEM_ORGANIZATION the same way PersonalAccessTokenRepository does.
      await uow.publishEvent({
        organizationId: SYSTEM_ORGANIZATION,
        stream: `principal:${principal.principalId}`,
        entityId: created.verificationId,
        eventType: 'password-reset-requested',
        projectionVersion: 1,
        payload: {
          verificationId: created.verificationId,
          recipientEmail: email,
          token: created.rawToken,
          expiresAt: created.expiresAt,
        },
      });
    });

    return { message: 'If the email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Reset password using a verification token' })
  @ApiOkResponse({ type: AuthSuccessResponse })
  async resetPassword(@Body() body: ResetPasswordRequest): Promise<AuthSuccessResponse> {
    if (body.newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters', {
        errorCode: 'auth-bad-request',
      });
    }

    const passwordHash = await argon2.hash(body.newPassword);

    await withTransaction(this.db, async (uow) => {
      const verification = await new AuthVerificationTokenRepository(this.db).consume(
        uow,
        body.token,
      );
      if (verification.kind !== 'password-reset') {
        throw new BadRequestException('Invalid reset token', { errorCode: 'auth-bad-request' });
      }

      await uow.tx
        .updateTable('identity_principals')
        .set({ password_hash: passwordHash, updated_at: new Date() })
        .where('principal_id', '=', verification.principalId)
        .execute();

      await uow.recordAudit({
        organizationId: SYSTEM_ORGANIZATION,
        entityType: 'identity-principal',
        entityId: verification.principalId,
        action: 'identity.password-reset',
        actor: `principal:${verification.principalId}`,
        authorizationContext: 'self-service:password-reset',
      });
    });

    return { message: 'Password has been reset successfully.' };
  }
}

/**
 * PAT scope policy: a PAT's scopes may never exceed the caller's own
 * current session scopes, and may never include an installation-privileged
 * scope — not even for a caller who legitimately holds one. A PAT is an
 * Integration-plane credential; its scopes must be narrow categorically, not
 * merely "narrow relative to what the issuer happened to hold".
 */
export function assertPatScopesAllowed(
  requested: readonly string[],
  callerScopes: readonly string[],
): void {
  const privileged = requested.find((scope) => PRIVILEGED_SCOPES.includes(scope));
  if (privileged !== undefined) {
    throw new ForbiddenException(
      `Scope "${privileged}" cannot be attached to a personal access token`,
      {
        errorCode: 'auth-forbidden',
      },
    );
  }
  const unheld = requested.filter((scope) => !callerScopes.includes(scope));
  if (unheld.length > 0) {
    throw new ForbiddenException(
      `Requested scopes exceed the caller's own scopes: ${unheld.join(', ')}`,
      { errorCode: 'auth-forbidden' },
    );
  }
}

/**
 * Personal Access Token management for MCP and external API integrations.
 * Requires an authenticated admin-control session.
 */
@ApiTags('auth')
@Controller('auth/pat')
@RequireSelf()
export class PersonalAccessTokenController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List personal access tokens for the current user' })
  @ApiOkResponse({ type: PatResponse, isArray: true })
  async list(@Req() request: RequestWithSubject): Promise<readonly PatResponse[]> {
    const principalId = requirePrincipalId(request);
    const tokens = await new PersonalAccessTokenRepository(this.db).listByPrincipal(principalId);
    return tokens.map(toPatResponse);
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a new personal access token' })
  @ApiCreatedResponse({
    type: PatCreatedResponse,
    description: 'Shown once — copy the token now, it is stored only as a hash',
  })
  async create(
    @Body() body: CreatePatRequest,
    @Req() request: RequestWithSubject,
  ): Promise<PatCreatedResponse> {
    const principalId = requirePrincipalId(request);
    if (body.expiresInDays < 1 || body.expiresInDays > 365) {
      throw new BadRequestException('expiresInDays must be between 1 and 365', {
        errorCode: 'auth-bad-request',
      });
    }

    const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);
    assertPatScopesAllowed(body.scopes ?? [], request.subject?.scopes ?? []);
    const scopes = body.scopes ?? [...(request.subject?.scopes ?? [])];

    const result = await withTransaction(this.db, (uow) =>
      new PersonalAccessTokenRepository(this.db).create(uow, {
        principalId,
        label: body.label,
        scopes,
        expiresAt,
        actor: `user:${principalId}`,
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
      }),
    );

    return {
      tokenId: result.tokenId,
      token: result.rawToken,
      label: result.label,
      scopes: [...result.scopes],
      expiresAt: result.expiresAt,
      createdAt: result.createdAt,
    };
  }

  @Delete(':tokenId')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a personal access token' })
  @ApiOkResponse({ type: PatResponse })
  async revoke(
    @Param('tokenId') tokenId: string,
    @Req() request: RequestWithSubject,
  ): Promise<PatResponse> {
    const principalId = requirePrincipalId(request);
    const revoked = await withTransaction(this.db, (uow) =>
      new PersonalAccessTokenRepository(this.db).revoke(uow, {
        tokenId,
        principalId,
        actor: `user:${principalId}`,
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
      }),
    );
    return toPatResponse(revoked);
  }
}

function requirePrincipalId(request: RequestWithSubject): string {
  const id = request.subject?.principalId ?? request.subject?.subjectId;
  if (!id)
    throw new UnauthorizedException('No principal identity resolved', {
      errorCode: 'auth-unauthorized',
    });
  return id;
}

function toPatResponse(pat: {
  readonly tokenId: string;
  readonly label: string;
  readonly scopes: readonly string[];
  readonly expiresAt: string;
  readonly revoked: boolean;
  readonly lastUsedAt?: string;
  readonly createdAt: string;
}): PatResponse {
  return {
    tokenId: pat.tokenId,
    label: pat.label,
    scopes: [...pat.scopes],
    revoked: pat.revoked,
    expiresAt: pat.expiresAt,
    createdAt: pat.createdAt,
    ...(pat.lastUsedAt === undefined ? {} : { lastUsedAt: pat.lastUsedAt }),
  };
}

let cachedPrivateKey: string | undefined;
let cachedJwks: { readonly keys: readonly Record<string, unknown>[] } | undefined;

export function getLocalKeys(): {
  readonly privateKey: string;
  readonly jwks: { readonly keys: readonly Record<string, unknown>[] };
} {
  if (cachedPrivateKey && cachedJwks) {
    return { privateKey: cachedPrivateKey, jwks: cachedJwks };
  }

  const cwd = process.cwd();
  const privateKeyFile =
    process.env.COPALIBRE_JWT_PRIVATE_KEY_FILE ??
    (existsSync(join(cwd, 'jwt-private.pem')) ? join(cwd, 'jwt-private.pem') : undefined) ??
    (existsSync('/var/lib/copalibre/jwt-private.pem')
      ? '/var/lib/copalibre/jwt-private.pem'
      : undefined);

  const jwksFile =
    process.env.COPALIBRE_JWKS_FILE ??
    (existsSync(join(cwd, 'jwks.json')) ? join(cwd, 'jwks.json') : undefined) ??
    (existsSync('/var/lib/copalibre/jwks.json') ? '/var/lib/copalibre/jwks.json' : undefined);

  if (privateKeyFile && existsSync(privateKeyFile)) {
    try {
      cachedPrivateKey = readFileSync(privateKeyFile, 'utf8');
    } catch {
      // ignore
    }
  }

  if (jwksFile && existsSync(jwksFile)) {
    try {
      cachedJwks = JSON.parse(readFileSync(jwksFile, 'utf8'));
    } catch {
      // ignore
    }
  }

  if (!cachedPrivateKey || !cachedJwks) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    cachedPrivateKey = cachedPrivateKey ?? privateKey;
    const jwk = createPublicKey(publicKey).export({ format: 'jwk' });
    cachedJwks = cachedJwks ?? {
      keys: [
        {
          ...jwk,
          kid: 'copalibre-local-key-1',
          use: 'sig',
          alg: 'RS256',
        },
      ],
    };
  }

  return { privateKey: cachedPrivateKey, jwks: cachedJwks };
}

@ApiTags('auth')
@Controller('.well-known')
export class WellKnownController {
  @Get('jwks.json')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'JSON Web Key Set for local token verification' })
  @ApiOkResponse({ type: JwksResponse })
  jwks(): { readonly keys: readonly Record<string, unknown>[] } {
    return getLocalKeys().jwks;
  }
}

/**
 * Issues a short-lived local JWT for native authentication using RS256.
 */
export async function issueLocalJwt(
  db: Kysely<Database>,
  principalId: string,
  email: string,
  organizationId?: string,
): Promise<string> {
  const { privateKey, jwks } = getLocalKeys();
  const firstKey = jwks.keys[0];
  const kid =
    (firstKey && typeof firstKey.kid === 'string' ? firstKey.kid : undefined) ??
    'copalibre-local-key-1';

  const isSuperAdmin = await new InstallationRoleRepository(db).findActiveByPrincipal(principalId);
  const scopes = ['copalibre.control', 'copalibre.participant'];
  if (isSuperAdmin) scopes.push(SUPER_ADMIN_SCOPE);

  const privateKeyObj = await importPKCS8(privateKey, 'RS256');

  const payload: Record<string, unknown> = {
    sub: principalId,
    email,
    scp: scopes.join(' '),
  };

  if (organizationId) {
    payload.org = organizationId;
  } else {
    const memberships = await new OrganizationAccessRepository(db).listOrganizationsForPrincipal(
      principalId,
    );
    const firstMembership = memberships[0];
    if (firstMembership) {
      payload.org = firstMembership.organizationId;
    }
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(process.env.COPALIBRE_JWT_ISSUER ?? 'http://localhost:8080')
    .setAudience(process.env.COPALIBRE_JWT_AUDIENCE ?? 'copalibre')
    .sign(privateKeyObj);
}
