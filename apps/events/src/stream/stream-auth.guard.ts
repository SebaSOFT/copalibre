import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenVerifier, TokenVerificationError, type RequestWithSubject } from '@copalibre/auth';

/**
 * Authenticating a stream (0018).
 *
 * The same verifier `apps/api` uses, from the same package, because two
 * implementations of "is this token valid" drift and the one that falls behind
 * is the one still accepting something it should not.
 *
 * **The token is read from the header and from nowhere else.** A query
 * parameter would be the easy path — native `EventSource` cannot set headers,
 * which is exactly why this phase does not use it — and the architecture doc is
 * explicit about why not: URLs leak into proxy logs, browser history, metrics,
 * traces, screenshots and error reports. A token in one of those is a token
 * that outlives the session that used it.
 */
@Injectable()
export class StreamAuthGuard implements CanActivate {
  constructor(@Inject(TokenVerifier) private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSubject>();
    const header = request.headers.authorization;
    const token = typeof header === 'string' ? bearer(header) : undefined;

    if (token === undefined) {
      throw new UnauthorizedException('This stream requires an Authorization: Bearer header');
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

function bearer(header: string): string | undefined {
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}

function carriesTokenInQuery(query: Record<string, unknown> | undefined): boolean {
  if (!query) return false;
  return ['access_token', 'accessToken', 'token', 'jwt'].some((key) => key in query);
}
