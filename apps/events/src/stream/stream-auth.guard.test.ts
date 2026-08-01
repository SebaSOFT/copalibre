import { TokenVerificationError, TokenVerifier, type AuthenticatedSubject } from '@copalibre/auth';
import type { ExecutionContext } from '@nestjs/common';
import { StreamAuthGuard } from './stream-auth.guard.js';

const SUBJECT: AuthenticatedSubject = {
  subjectId: 'user-1',
  organizationId: 'org-1',
  scopes: ['match.write'],
};

function verifier(result: AuthenticatedSubject | Error): TokenVerifier {
  return {
    verify: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  } as unknown as TokenVerifier;
}

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('authenticating a stream', () => {
  it('accepts a bearer token in the header and attaches the subject', async () => {
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer good' } };
    const guard = new StreamAuthGuard(verifier(SUBJECT));

    expect(await guard.canActivate(context(request))).toBe(true);
    expect(request.subject).toEqual(SUBJECT);
  });

  it('refuses a request with no Authorization header', async () => {
    const guard = new StreamAuthGuard(verifier(SUBJECT));

    await expect(guard.canActivate(context({ headers: {} }))).rejects.toThrow('Authorization');
  });

  it.each([
    ['a scheme it does not know', { authorization: 'Basic abc' }],
    ['a bearer with no value', { authorization: 'Bearer' }],
  ])('refuses %s', async (_label, headers) => {
    const guard = new StreamAuthGuard(verifier(SUBJECT));

    await expect(guard.canActivate(context({ headers }))).rejects.toThrow();
  });

  it.each(['access_token', 'accessToken', 'token', 'jwt'])(
    'refuses a request carrying %s in the query string',
    async (key) => {
      // Accepting it once means a client ships that way, and then the token is
      // in proxy logs, browser history, metrics, traces and screenshots.
      const guard = new StreamAuthGuard(verifier(SUBJECT));
      const request = { headers: { authorization: 'Bearer good' }, query: { [key]: 'leaked' } };

      await expect(guard.canActivate(context(request))).rejects.toThrow('never appear in a URL');
    },
  );

  it('allows an ordinary query parameter that is not a credential', async () => {
    const guard = new StreamAuthGuard(verifier(SUBJECT));
    const request = { headers: { authorization: 'Bearer good' }, query: { after: 'ev-1' } };

    expect(await guard.canActivate(context(request))).toBe(true);
  });

  it('refuses a token the verifier rejected, saying why', async () => {
    const guard = new StreamAuthGuard(
      verifier(new TokenVerificationError('expired', 'the token expired')),
    );

    await expect(
      guard.canActivate(context({ headers: { authorization: 'Bearer stale' } })),
    ).rejects.toThrow('the token expired');
  });

  it('does not leak an unexpected failure to the caller', async () => {
    const guard = new StreamAuthGuard(verifier(new Error('JWKS host unreachable')));

    await expect(
      guard.canActivate(context({ headers: { authorization: 'Bearer x' } })),
    ).rejects.toThrow('Token rejected');
  });
});
