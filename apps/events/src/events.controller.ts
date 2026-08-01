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
import { OrganizationRepository, type Database } from '@copalibre/persistence';
import type { RequestWithSubject } from '@copalibre/auth';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.token.js';
import { ConnectionLimiter } from './stream/connection-limits.js';
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

@Controller('events')
export class EventsController {
  private readonly subscriptions: SubscriptionService;
  private readonly limiter = new ConnectionLimiter();

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {
    this.subscriptions = SubscriptionService.fromDatabase(this.db);
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
