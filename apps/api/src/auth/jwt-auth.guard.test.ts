// Under ESM, Jest's `jest` object is not a global; it must be imported.
import { jest } from '@jest/globals';
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { extractBearerToken, JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthenticatedSubject, RequestWithSubject } from './request-context.js';
import { SECURITY_PLANE_KEY, type SecurityPlane } from './security-plane.js';
import { REQUIRED_SCOPES_KEY } from './required-scopes.js';
import type { TokenVerifier } from './token-verifier.js';
import { PersonalAccessTokenRepository, hashToken, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';

function contextFor(
  request: RequestWithSubject,
  plane: SecurityPlane | undefined,
  requiredScopes?: readonly string[],
): { context: ExecutionContext; reflector: Reflector } {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
    if (key === SECURITY_PLANE_KEY) return plane;
    if (key === REQUIRED_SCOPES_KEY) return requiredScopes;
    return undefined;
  });

  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: <T>() => request as T }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

function verifierReturning(subject: AuthenticatedSubject): TokenVerifier {
  const verify = jest.fn<(token: string) => Promise<AuthenticatedSubject>>();
  verify.mockResolvedValue(subject);
  return { verify } as unknown as TokenVerifier;
}

function rejectingVerifier(): TokenVerifier {
  const verify = jest.fn<(token: string) => Promise<AuthenticatedSubject>>();
  verify.mockRejectedValue(new Error('nope'));
  return { verify } as unknown as TokenVerifier;
}

const controlSubject: AuthenticatedSubject = {
  subjectId: 'organizer-1',
  organizationId: 'org-1',
  scopes: ['copalibre.control'],
};

describe('JwtAuthGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lets a public-read route through without a token', async () => {
    const request: RequestWithSubject = { headers: {} };
    const { context, reflector } = contextFor(request, 'public-read');
    const guard = new JwtAuthGuard(reflector, rejectingVerifier(), {} as Kysely<Database>);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.subject).toBeUndefined();
  });

  it('attaches the verified subject on an authenticated route', async () => {
    const request: RequestWithSubject = { headers: { authorization: 'Bearer good-token' } };
    const { context, reflector } = contextFor(request, 'admin-control');
    const guard = new JwtAuthGuard(
      reflector,
      verifierReturning(controlSubject),
      {} as Kysely<Database>,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.subject).toEqual(controlSubject);
  });

  it('rejects a missing Authorization header with 401', async () => {
    const { context, reflector } = contextFor({ headers: {} }, 'admin-control');
    const guard = new JwtAuthGuard(
      reflector,
      verifierReturning(controlSubject),
      {} as Kysely<Database>,
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid token with 401 and no reason leaked', async () => {
    const { context, reflector } = contextFor(
      { headers: { authorization: 'Bearer bad' } },
      'admin-control',
    );
    const guard = new JwtAuthGuard(reflector, rejectingVerifier(), {} as Kysely<Database>);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      message: 'Invalid bearer token',
    });
  });

  it('returns 403 (not 401) when a verified token lacks the plane scope', async () => {
    const request: RequestWithSubject = { headers: { authorization: 'Bearer good' } };
    const { context, reflector } = contextFor(request, 'admin-control');
    // Participant scope only, on an admin-control route.
    const guard = new JwtAuthGuard(
      reflector,
      verifierReturning({ ...controlSubject, scopes: ['copalibre.participant'] }),
      {} as Kysely<Database>,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(request.subject).toBeUndefined();
  });

  it('fails closed on an untagged route: treated as admin-control', async () => {
    const { context, reflector } = contextFor({ headers: {} }, undefined);
    const guard = new JwtAuthGuard(
      reflector,
      verifierReturning(controlSubject),
      {} as Kysely<Database>,
    );
    // No token -> 401, proving the route was NOT treated as public.
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ignores a token supplied as a query parameter', async () => {
    const request: RequestWithSubject = {
      headers: {},
      query: { access_token: 'smuggled-token' },
    };
    const { context, reflector } = contextFor(request, 'admin-control');
    const guard = new JwtAuthGuard(
      reflector,
      verifierReturning(controlSubject),
      {} as Kysely<Database>,
    );

    // URLs leak into proxy logs, history, metrics and screenshots, so a
    // query-string token must leave the caller unauthenticated.
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.subject).toBeUndefined();
  });

  it('requires the participant scope on the authenticated-interaction plane', async () => {
    const request: RequestWithSubject = { headers: { authorization: 'Bearer good' } };
    const { context, reflector } = contextFor(request, 'authenticated-interaction');
    const guard = new JwtAuthGuard(
      reflector,
      verifierReturning({ ...controlSubject, scopes: ['copalibre.control'] }),
      {} as Kysely<Database>,
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses an explicit scope requirement over the plane default', async () => {
    const request: RequestWithSubject = { headers: { authorization: 'Bearer invite' } };
    const { context, reflector } = contextFor(request, 'authenticated-interaction', [
      'copalibre.invite.accept',
    ]);
    const guard = new JwtAuthGuard(
      reflector,
      verifierReturning({ ...controlSubject, scopes: ['copalibre.invite.accept'] }),
      {} as Kysely<Database>,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
  it('validates a clpat_ token against the database repository', async () => {
    const scopeOf = jest
      .spyOn(PersonalAccessTokenRepository.prototype, 'scopeOf')
      .mockResolvedValue({
        tokenId: 'token-1',
        principalId: 'org-1-admin',
        scopes: ['copalibre.control'],
      });

    jest
      .spyOn(PersonalAccessTokenRepository.prototype, 'touchLastUsed')
      .mockResolvedValue(undefined);
    const mockDb = {
      selectFrom: jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            executeTakeFirst: jest
              .fn()
              .mockResolvedValue({ email: 'admin@example.com' } as unknown as never),
          }),
        }),
      }),
    };

    const request: RequestWithSubject = { headers: { authorization: 'Bearer clpat_validtoken' } };
    const { context, reflector } = contextFor(request, 'admin-control');
    const guard = new JwtAuthGuard(
      reflector,
      rejectingVerifier(),
      mockDb as unknown as Kysely<Database>,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(scopeOf).toHaveBeenCalledWith(hashToken('clpat_validtoken'));
    expect(request.subject).toEqual({
      subjectId: 'org-1-admin',
      scopes: ['copalibre.control'],
      tokenId: 'token-1',
      email: 'admin@example.com',
      principalId: 'org-1-admin',
      name: undefined,
    });
  });

  it('rejects a clpat_ token if it is not found or revoked in the database', async () => {
    jest.spyOn(PersonalAccessTokenRepository.prototype, 'scopeOf').mockResolvedValue(undefined);

    const request: RequestWithSubject = { headers: { authorization: 'Bearer clpat_invalid' } };
    const { context, reflector } = contextFor(request, 'admin-control');
    const guard = new JwtAuthGuard(reflector, rejectingVerifier(), {} as Kysely<Database>);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not let a usage-heartbeat failure reject valid PAT authentication', async () => {
    jest.spyOn(PersonalAccessTokenRepository.prototype, 'scopeOf').mockResolvedValue({
      tokenId: 'token-1',
      principalId: 'org-1-admin',
      scopes: ['copalibre.control'],
    });
    jest
      .spyOn(PersonalAccessTokenRepository.prototype, 'touchLastUsed')
      .mockRejectedValue(new Error('database unavailable'));
    const mockDb = {
      selectFrom: jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            executeTakeFirst: jest
              .fn()
              .mockResolvedValue({ email: 'admin@example.com' } as unknown as never),
          }),
        }),
      }),
    };
    const request: RequestWithSubject = { headers: { authorization: 'Bearer clpat_validtoken' } };
    const { context, reflector } = contextFor(request, 'admin-control');
    const guard = new JwtAuthGuard(
      reflector,
      rejectingVerifier(),
      mockDb as unknown as Kysely<Database>,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('extractBearerToken', () => {
  it('reads a well-formed header', () => {
    expect(extractBearerToken({ headers: { authorization: 'Bearer abc' } })).toBe('abc');
  });

  it('is case-insensitive on the scheme', () => {
    expect(extractBearerToken({ headers: { authorization: 'bearer abc' } })).toBe('abc');
  });

  it('accepts a capitalized header name', () => {
    expect(extractBearerToken({ headers: { Authorization: 'Bearer abc' } })).toBe('abc');
  });

  it('takes the first value when the header repeats', () => {
    expect(extractBearerToken({ headers: { authorization: ['Bearer abc', 'Bearer xyz'] } })).toBe(
      'abc',
    );
  });

  it.each([
    ['no header', {}],
    ['wrong scheme', { authorization: 'Basic abc' }],
    ['scheme only', { authorization: 'Bearer' }],
    ['empty token', { authorization: 'Bearer ' }],
    ['extra segments', { authorization: 'Bearer abc def' }],
    ['non-string header', { authorization: 42 as unknown as string }],
  ])('returns undefined for %s', (_label, headers) => {
    expect(extractBearerToken({ headers: headers as Record<string, string> })).toBeUndefined();
  });
});
