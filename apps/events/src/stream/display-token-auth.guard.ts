import { createHash } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DisplayTokenRepository,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';

/** What a display-token-authorized request carries for the controller to use. */
export interface DisplayTokenRequest {
  displayTokenId?: string;
  /** The tournament's real id, resolved from the URL's alias by this guard. */
  tournamentId?: string;
  readonly headers: Record<string, unknown>;
  readonly params: Record<string, string | undefined>;
  readonly query?: Record<string, unknown>;
}

/**
 * Authorizes `/tv/**`'s SSE stream against a device-scoped display token,
 * never a person's JWT. Same "header only, never a query parameter"
 * rule as `StreamAuthGuard` — the token's presence in the device's own launch
 * URL is a provisioning-time exception (see `broadcast.controller.ts`), not a
 * license for the stream request itself to repeat that pattern.
 */
@Injectable()
export class DisplayTokenAuthGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DisplayTokenRequest>();
    const header = request.headers.authorization;
    const token = typeof header === 'string' ? bearer(header) : undefined;

    if (token === undefined) {
      throw new UnauthorizedException('This stream requires an Authorization: Bearer header');
    }
    if (request.query && 'token' in request.query) {
      throw new UnauthorizedException(
        'A display token must never appear in a URL on the stream request; send it as an Authorization header',
      );
    }

    const scope = await new DisplayTokenRepository(this.db).scopeOf(hash(token));
    if (!scope) throw new UnauthorizedException('Display token rejected');

    // The route carries organization/tournament as aliases, same as every
    // other web-facing path; the token's scope is stored by real id, so the
    // comparison resolves the alias rather than comparing the two directly.
    const organizationAlias = request.params.organization;
    const tournamentAlias = request.params.tournament;
    if (organizationAlias === undefined || tournamentAlias === undefined) {
      throw new NotFoundException('No tournament named');
    }
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament) throw new NotFoundException(`No tournament "${tournamentAlias}"`);
    if (scope.tournamentId !== tournament.tournamentId) {
      throw new ForbiddenException('Display token is not scoped to this tournament');
    }

    request.displayTokenId = scope.displayTokenId;
    // The subscription query below filters by real id; resolving it here,
    // once, means the controller never re-derives it from the alias itself.
    request.tournamentId = tournament.tournamentId;
    return true;
  }
}

function bearer(header: string): string | undefined {
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
