import * as argon2 from 'argon2';
import { SignJWT } from 'jose';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
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
  PersonalAccessTokenRepository,
  AuthVerificationTokenRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireSelf } from '../auth/access-requirement.js';
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
} from '../dto/auth.dto.js';

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
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ type: LoginResponse })
  async login(@Body() body: LoginRequest): Promise<LoginResponse> {
    // Check if principal exists
    const principal = await this.db
      .selectFrom('identity_principals')
      .selectAll()
      .where('email', '=', body.email.toLowerCase().trim())
      .executeTakeFirst();

    if (!principal?.password_hash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await argon2.verify(principal.password_hash, body.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await issueLocalJwt(principal.principal_id, principal.email);
    return { accessToken, expiresIn: 3600 };
  }

  @Post('forgot-password')
  @HttpCode(200)
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiOkResponse({ type: AuthSuccessResponse })
  async forgotPassword(@Body() body: ForgotPasswordRequest): Promise<AuthSuccessResponse> {
    const email = body.email.toLowerCase().trim();
    const principal = await new IdentityPrincipalRepository(this.db).findByEmail(email);

    // Always return success to prevent email enumeration.
    if (!principal) return { message: 'If the email exists, a reset link has been sent.' };

    const { rawToken } = await withTransaction(this.db, (uow) =>
      new AuthVerificationTokenRepository(this.db).create(uow, {
        principalId: principal.principalId,
        kind: 'password-reset',
        ttlMs: 60 * 60 * 1000, // 1 hour
      }),
    );

    // TODO: Send email with reset link containing rawToken
    // For now, log it in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Password reset token for ${email}: ${rawToken}`);
    }

    return { message: 'If the email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  @HttpCode(200)
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Reset password using a verification token' })
  @ApiOkResponse({ type: AuthSuccessResponse })
  async resetPassword(@Body() body: ResetPasswordRequest): Promise<AuthSuccessResponse> {
    if (body.newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const passwordHash = await argon2.hash(body.newPassword);

    await withTransaction(this.db, async (uow) => {
      const verification = await new AuthVerificationTokenRepository(this.db).consume(
        uow,
        body.token,
      );
      if (verification.kind !== 'password-reset') {
        throw new BadRequestException('Invalid reset token');
      }

      await uow.tx
        .updateTable('identity_principals')
        .set({ password_hash: passwordHash, updated_at: new Date() })
        .where('principal_id', '=', verification.principalId)
        .execute();
    });

    return { message: 'Password has been reset successfully.' };
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
      throw new BadRequestException('expiresInDays must be between 1 and 365');
    }

    const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);
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
  if (!id) throw new UnauthorizedException('No principal identity resolved');
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

/**
 * Issues a short-lived local JWT for native authentication.
 * Uses HS256 with a server-side secret for simplicity in the local IdP case.
 */
async function issueLocalJwt(principalId: string, email: string): Promise<string> {
  const secret = process.env.COPALIBRE_JWT_SECRET;
  if (!secret) throw new Error('COPALIBRE_JWT_SECRET is not configured');

  const encoder = new TextEncoder();
  return new SignJWT({
    sub: principalId,
    email,
    scp: 'copalibre.control copalibre.participant',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(process.env.COPALIBRE_JWT_ISSUER ?? 'copalibre')
    .setAudience(process.env.COPALIBRE_JWT_AUDIENCE ?? 'copalibre')
    .sign(encoder.encode(secret));
}
