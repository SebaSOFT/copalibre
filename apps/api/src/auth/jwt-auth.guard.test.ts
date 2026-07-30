import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { extractBearerToken, JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedSubject, RequestWithSubject } from './request-context';
import { SECURITY_PLANE_KEY, type SecurityPlane } from './security-plane';
import type { TokenVerifier } from './token-verifier';

function contextFor(
  request: RequestWithSubject,
  plane: SecurityPlane | undefined,
): { context: ExecutionContext; reflector: Reflector } {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => (key === SECURITY_PLANE_KEY ? plane : undefined));

  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: <T>() => request as T }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

function verifierReturning(subject: AuthenticatedSubject): TokenVerifier {
  return { verify: jest.fn().mockResolvedValue(subject) } as unknown as TokenVerifier;
}

function rejectingVerifier(): TokenVerifier {
  return { verify: jest.fn().mockRejectedValue(new Error('nope')) } as unknown as TokenVerifier;
}

const controlSubject: AuthenticatedSubject = {
  subjectId: 'organizer-1',
  organizationId: 'org-1',
  scopes: ['copalibre.control'],
};

describe('JwtAuthGuard', () => {
  it('lets a public-read route through without a token', async () => {
    const request: RequestWithSubject = { headers: {} };
    const { context, reflector } = contextFor(request, 'public-read');
    const guard = new JwtAuthGuard(reflector, rejectingVerifier());

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.subject).toBeUndefined();
  });

  it('attaches the verified subject on an authenticated route', async () => {
    const request: RequestWithSubject = { headers: { authorization: 'Bearer good-token' } };
    const { context, reflector } = contextFor(request, 'admin-control');
    const guard = new JwtAuthGuard(reflector, verifierReturning(controlSubject));

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.subject).toEqual(controlSubject);
  });

  it('rejects a missing Authorization header with 401', async () => {
    const { context, reflector } = contextFor({ headers: {} }, 'admin-control');
    const guard = new JwtAuthGuard(reflector, verifierReturning(controlSubject));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid token with 401 and no reason leaked', async () => {
    const { context, reflector } = contextFor(
      { headers: { authorization: 'Bearer bad' } },
      'admin-control',
    );
    const guard = new JwtAuthGuard(reflector, rejectingVerifier());
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
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(request.subject).toBeUndefined();
  });

  it('fails closed on an untagged route: treated as admin-control', async () => {
    const { context, reflector } = contextFor({ headers: {} }, undefined);
    const guard = new JwtAuthGuard(reflector, verifierReturning(controlSubject));
    // No token -> 401, proving the route was NOT treated as public.
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ignores a token supplied as a query parameter', async () => {
    const request: RequestWithSubject = {
      headers: {},
      query: { access_token: 'smuggled-token' },
    };
    const { context, reflector } = contextFor(request, 'admin-control');
    const guard = new JwtAuthGuard(reflector, verifierReturning(controlSubject));

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
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
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
