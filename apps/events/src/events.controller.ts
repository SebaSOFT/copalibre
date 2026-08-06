import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  DisplayTokenRepository,
  OrganizationRepository,
  type Database,
} from '@copalibre/persistence';
import type { RequestWithSubject } from '@copalibre/auth';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.token.js';
import { ConnectionLimiter } from './stream/connection-limits.js';
import {
  DisplayTokenAuthGuard,
  type DisplayTokenRequest,
} from './stream/display-token-auth.guard.js';
import { StreamAuthGuard } from './stream/stream-auth.guard.js';
import { streamEvents, type StreamSink } from './stream/stream-writer.js';
import { SubscriptionService, type SubscriptionQuery } from './stream/subscription.js';

/**
 * The two streams and the fallback (0018).
 *
 * One public channel serves the public web, the bracket views and the
 * TV/broadcast surfaces — the architecture doc is explicit that "the underlying
 * data is the same published projection, only the rendering differs", so a
 * second endpoint per surface is complexity with no question behind it.
 */

/** What a Fastify reply looks like to the writer, and nothing more. */
interface RawReply {
  raw: {
    writableEnded: boolean;
    write(chunk: string): void;
    end(): void;
    writeHead(status: number, headers: Record<string, string>): void;
  };
}

interface ClosableRequest extends RequestWithSubject {
  readonly ip?: string;
  readonly raw?: { on(event: 'close', listener: () => void): void };
}

const PROXY_DIAGNOSTIC_HEARTBEAT_MS = 2_000;

@Controller('events')
export class EventsController {
  private readonly subscriptions: SubscriptionService;
  private readonly limiter = new ConnectionLimiter();

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {
    this.subscriptions = SubscriptionService.fromDatabase(this.db);
  }

  /**
   * A finite SSE stream for `copalibre doctor --check-proxy`. The first comment
   * must arrive immediately and the second after an idle interval; a buffering
   * proxy therefore cannot make this look like a healthy stream by returning
   * the final body all at once.
   */
  @Get('proxy-check')
  async proxyCheck(@Res() reply: RawReply): Promise<void> {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': copalibre-proxy-check-1\n\n');
    await delay(PROXY_DIAGNOSTIC_HEARTBEAT_MS);
    if (!reply.raw.writableEnded) {
      reply.raw.write(': copalibre-proxy-check-2\n\n');
      reply.raw.end();
    }
  }

  /**
   * The public stream. No `Authorization` header is involved at all — a
   * spectator has no account, and requiring one to see a score would be a
   * different product.
   */
  @Get('public/:organization/tournaments/:tournament')
  async publicStream(
    @Param('organization') organizationAlias: string,
    @Param('tournament') tournamentId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: ClosableRequest,
    @Res() reply: RawReply,
  ): Promise<void> {
    const organizationId = await this.organizationIdOf(organizationAlias);
    await this.stream(request, reply, `${organizationId}:${tournamentId}`, {
      organizationId,
      tournamentId,
      visibility: 'public',
      ...(lastEventId === undefined ? {} : { afterEventId: lastEventId }),
    });
  }

  /**
   * The authenticated stream, over Fetch streaming rather than `EventSource`.
   *
   * Same wire format, same replay semantics; the only difference is that the
   * client can send a bearer header, which is the entire reason this path
   * exists.
   */
  @Get('control/:organization')
  @UseGuards(StreamAuthGuard)
  async controlStream(
    @Param('organization') organizationAlias: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: ClosableRequest,
    @Res() reply: RawReply,
  ): Promise<void> {
    const organizationId = await this.organizationIdOf(organizationAlias);
    await this.stream(request, reply, organizationId, {
      organizationId,
      visibility: 'control',
      ...(lastEventId === undefined ? {} : { afterEventId: lastEventId }),
    });
  }

  /**
   * The `/tv/**` stream (0031): same public projection and same channel as
   * `publicStream` — "the underlying data is the same published projection,
   * only the rendering differs" — gated by a device-scoped display token
   * instead of being open to anyone, since a kiosk is a specific,
   * operator-authorized, revocable device rather than an anonymous visitor.
   *
   * One route for both the full-rotation and pinned-to-one-match pages: there
   * is no match-scoped stream anywhere in this system (`publicStream` has
   * none either) — a pinned view subscribes to the same tournament stream and
   * renders only its one match, the same "same channel, different rendering"
   * shape as everything else `/tv/**` reuses.
   */
  @Get('tv/:organization/tournaments/:tournament')
  @UseGuards(DisplayTokenAuthGuard)
  async tvStream(
    @Param('organization') organizationAlias: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: ClosableRequest & DisplayTokenRequest,
    @Res() reply: RawReply,
  ): Promise<void> {
    const organizationId = await this.organizationIdOf(organizationAlias);
    if (request.displayTokenId !== undefined) {
      // Fire-and-forget: the device-health heartbeat never gates the stream.
      void new DisplayTokenRepository(this.db).touchLastSeen(request.displayTokenId);
    }
    // The guard already resolved the URL's tournament alias to its real id
    // (it had to, to compare against the token's stored scope) — reused here
    // rather than re-querying, and required rather than the alias itself:
    // the subscription query below filters on the real id.
    const tournamentId = request.tournamentId;
    if (tournamentId === undefined) {
      throw new Error('DisplayTokenAuthGuard did not resolve a tournament id');
    }
    await this.stream(request, reply, `${organizationId}:${tournamentId}`, {
      organizationId,
      tournamentId,
      visibility: 'public',
      ...(lastEventId === undefined ? {} : { afterEventId: lastEventId }),
    });
  }

  private async organizationIdOf(alias: string): Promise<string> {
    const organization = await new OrganizationRepository(this.db).findByAlias(alias);
    if (!organization) throw new NotFoundException(`No organization with alias "${alias}"`);
    return organization.organizationId;
  }

  private async stream(
    request: ClosableRequest,
    reply: RawReply,
    resource: string,
    query: SubscriptionQuery,
  ): Promise<void> {
    const admission = this.limiter.admit(request.ip ?? 'unknown', resource);
    if (!admission.admitted) {
      // Refused before the headers, so a client that cannot be served does not
      // sit on an open stream waiting for events that will never come.
      throw new ServiceUnavailableException(admission.reason);
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      // `no-transform` matters as much as `no-cache`: a proxy that "optimises"
      // the body is a proxy that buffers it, and a buffered stream is a stream
      // that arrives in bursts after the match ended.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let open = true;
    const close = (): void => void (open = false);
    request.raw?.on('close', close);

    const sink: StreamSink = {
      write: (chunk) => {
        if (!reply.raw.writableEnded) reply.raw.write(chunk);
      },
      isOpen: () => open && !reply.raw.writableEnded,
    };

    try {
      await streamEvents(this.subscriptions, sink, query);
    } finally {
      admission.release();
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * The long-polling fallback, for a network or proxy that will not carry SSE.
 *
 * A thin wrapper over the same resolution the stream uses, rather than a second
 * implementation — two definitions of "replay window" would eventually disagree
 * about which side of it a client is on, and only one would be right.
 */
@Controller('api/events')
export class LongPollController {
  private readonly subscriptions: SubscriptionService;

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {
    this.subscriptions = SubscriptionService.fromDatabase(this.db);
  }

  @Get()
  @UseGuards(StreamAuthGuard)
  async poll(
    @Query('after') after: string | undefined,
    @Query('wait') wait: string | undefined,
    @Query('organization') organizationAlias: string | undefined,
    @Req() request: RequestWithSubject,
  ): Promise<{
    readonly events: readonly unknown[];
    readonly cursor?: string;
    readonly action?: string;
    readonly reason?: string;
  }> {
    const alias = organizationAlias ?? request.subject?.organizationId;
    if (alias === undefined) throw new NotFoundException('No organization named');

    const organization = await new OrganizationRepository(this.db).findByAlias(alias);
    const organizationId = organization?.organizationId ?? alias;

    const waitSeconds = Math.min(Math.max(Number(wait ?? 25), 0), 60);
    const deadline = Date.now() + waitSeconds * 1000;
    let cursor = after;

    for (;;) {
      const batch = await this.subscriptions.next({
        organizationId,
        visibility: 'control',
        ...(cursor === undefined ? {} : { afterEventId: cursor }),
      });

      if (batch.kind === 'expired') {
        return { events: [], action: 'fetch-projection', reason: batch.reason };
      }
      if (batch.events.length > 0) {
        return { events: batch.events, ...(batch.cursor ? { cursor: batch.cursor } : {}) };
      }
      if (Date.now() >= deadline) {
        // An empty batch and the cursor it came in with: the client asks again
        // with the same position rather than having to reason about a timeout.
        return { events: [], ...(cursor ? { cursor } : {}) };
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      cursor = batch.cursor ?? cursor;
    }
  }
}
