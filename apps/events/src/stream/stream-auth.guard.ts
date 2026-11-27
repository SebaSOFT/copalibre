import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  extractAccessToken,
  sessionCookieConfigFromEnv,
  TokenVerifier,
  TokenVerificationError,
  type RequestWithSubject,
  type SessionCookieConfig,
} from '@copalibre/auth';

/** DI token for the session cookie settings; absent, they are read from the environment. */
export const STREAM_SESSION_COOKIE_CONFIG = Symbol('STREAM_SESSION_COOKIE_CONFIG');

/**
 * Authenticating a stream.
 *
 * The same verifier `apps/api` uses, from the same package, because two
 * implementations of "is this token valid" drift and the one that falls behind
 * is the one still accepting something it should not.
 *
 * **The token is read from the `Authorization` header or, for a Control
 * browser session, from the `HttpOnly` session cookie — never from the URL.**
 * The header wins when both are present, and a personal access token in the
 * cookie is ignored. A query parameter would be the easy path, and the
 * architecture doc is explicit about why not: URLs leak into proxy logs, browser history, metrics,
 * traces, screenshots and error reports. A token in one of those is a token
 * that outlives the session that used it.
 */
@Injectable()
export class StreamAuthGuard implements CanActivate {
  constructor(
    @Inject(TokenVerifier) private readonly verifier: TokenVerifier,
    @Optional()
    @Inject(STREAM_SESSION_COOKIE_CONFIG)
    private readonly cookieConfig: SessionCookieConfig = sessionCookieConfigFromEnv(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSubject>();
    const token = extractAccessToken(request, this.cookieConfig)?.token;

    if (token === undefined) {
      throw new UnauthorizedException(
        'This stream requires a session cookie or an Authorization: Bearer header',
      );
    }

    // A token in the query string is refused rather than accepted-and-warned:
    // accepting it once means a client ships that way and the leak is
    // permanent.
    if (carriesTokenInQuery(request.query)) {
      throw new UnauthorizedException(
        'An access token must never appear in a URL; send it as an Authorization header',
      );
    }

    try {
      request.subject = await this.verifier.verify(token);
      return true;
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof TokenVerificationError ? error.message : 'Token rejected',
      );
    }
  }
}

function carriesTokenInQuery(query: Record<string, unknown> | undefined): boolean {
  if (!query) return false;
  return ['access_token', 'accessToken', 'token', 'jwt'].some((key) => key in query);
}
