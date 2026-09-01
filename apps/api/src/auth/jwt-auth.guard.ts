import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PLANE_REQUIRED_SCOPES,
  planeRequiresAuthentication,
  SECURITY_PLANE_KEY,
  type SecurityPlane,
} from './security-plane.js';
import type { RequestWithSubject, AuthenticatedSubject } from './request-context.js';
import { TokenVerifier } from './token-verifier.js';
import { REQUIRED_SCOPES_KEY } from './required-scopes.js';
import { PersonalAccessTokenRepository, hashToken, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';

/**
 * Authentication only: is this token valid, and does the subject hold the coarse
 * scope its route's plane demands? Whether the subject may act on *this
 * resource* is the policy layer's separate concern.
 *
 * Fails closed: a route with no declared plane is treated as admin-control, so
 * forgetting the tag cannot accidentally publish an endpoint.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenVerifier) private readonly verifier: TokenVerifier,
    @Inject(DATABASE) private readonly db: Kysely<Database>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const plane =
      this.reflector.getAllAndOverride<SecurityPlane>(SECURITY_PLANE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'admin-control';

    const request = context.switchToHttp().getRequest<RequestWithSubject>();
    const token = extractBearerToken(request);
    if (!token) {
      if (!planeRequiresAuthentication(plane)) {
        return true;
      }
      throw new UnauthorizedException('Missing bearer token');
    }

    let subject;
    if (token.startsWith('clpat_')) {
      try {
        subject = await this.verifyPat(token);
      } catch (err) {
        if (!planeRequiresAuthentication(plane)) {
          return true;
        }
        throw err;
      }
    } else {
      try {
        subject = await this.verifier.verify(token);
      } catch {
        if (!planeRequiresAuthentication(plane)) {
          return true;
        }
        // Deliberately opaque: the specific rejection reason is logged upstream,
        // never returned, so a caller cannot probe issuer/audience config.
        throw new UnauthorizedException('Invalid bearer token');
      }
    }

    if (planeRequiresAuthentication(plane)) {
      const required =
        this.reflector.getAllAndOverride<readonly string[]>(REQUIRED_SCOPES_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) ?? PLANE_REQUIRED_SCOPES[plane];
      const missing = required.filter((scope) => !subject.scopes.includes(scope));
      if (missing.length > 0) {
        // Authentication succeeded, authorization did not: 403, never 401.
        throw new ForbiddenException(`Token is missing required scope: ${missing.join(', ')}`);
      }
    }

    request.subject = subject;
    return true;
  }

  private async verifyPat(rawToken: string): Promise<AuthenticatedSubject> {
    const tokenHash = hashToken(rawToken);
    const patRepo = new PersonalAccessTokenRepository(this.db);
    const scope = await patRepo.scopeOf(tokenHash);
    if (!scope) {
      throw new UnauthorizedException('Invalid or expired personal access token');
    }

    // Resolve the principal's identity for the subject context
    const principal = await this.db
      .selectFrom('identity_principals')
      .selectAll()
      .where('principal_id', '=', scope.principalId)
      .executeTakeFirst();
    if (!principal) {
      throw new UnauthorizedException('Token principal not found');
    }

    // Fire-and-forget usage tracking
    void patRepo.touchLastUsed(scope.tokenId).catch(() => undefined);

    return {
      subjectId: scope.principalId,
      scopes: [...scope.scopes],
      tokenId: scope.tokenId,
      email: principal.email,
      ...(principal.name === null ? {} : { name: principal.name }),
      principalId: scope.principalId,
    };
  }
}

/**
 * Header-only extraction. A token in the query string is ignored on purpose —
 * "Never place an access or refresh token in an SSE URL query string. URLs leak
 * into proxy logs, browser history, metrics, traces, screenshots, and error
 * reports." A caller who passes `?access_token=` is therefore unauthenticated.
 */
export function extractBearerToken(request: RequestWithSubject): string | undefined {
  const header = request.headers.authorization ?? request.headers.Authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') return undefined;

  const [scheme, token, ...rest] = value.split(' ');
  if (rest.length > 0) return undefined;
  if (scheme?.toLowerCase() !== 'bearer') return undefined;
  return token && token.length > 0 ? token : undefined;
}
