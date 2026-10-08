import { Controller, Get, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { DeadLetter, RelayMetrics } from '@copalibre/persistence';
import { RelayService } from './relay.service.js';
import {
  DeliveryOutcomeCounters,
  type DeliveryOutcomeCounts,
} from './notifications/delivery-outcomes.js';

/** The relay's own figures, plus the email delivery outcomes this replica has seen since it started. */
export type WorkerMetrics = RelayMetrics & { readonly emailDelivery: DeliveryOutcomeCounts };

/**
 * The operator's view of what failed.
 *
 * A dead letter is *inspected*, never dropped: a queue that discards what it
 * cannot process is a queue that loses a finalized match and tells nobody. And
 * re-enqueueing is explicit — retries were already exhausted, so retrying again
 * without somebody deciding that something changed is the same failure on a
 * timer.
 */
@Controller('jobs')
export class DeadLetterController {
  constructor(
    @Inject(RelayService) private readonly relay: RelayService,
    @Inject(DeliveryOutcomeCounters) private readonly deliveries: DeliveryOutcomeCounters,
  ) {}

  @Get('dead-letters')
  async deadLetters(@Query('limit') limit?: string): Promise<readonly DeadLetter[]> {
    return this.relay.outbox().deadLetters(limit === undefined ? undefined : Number(limit));
  }

  @Post('dead-letters/:eventId/re-enqueue')
  async reEnqueue(@Param('eventId') eventId: string): Promise<{ reEnqueued: string }> {
    const done = await this.relay.outbox().reEnqueue(eventId);
    if (!done) {
      throw new NotFoundException(`No dead-lettered job with id ${eventId}`);
    }
    return { reEnqueued: eventId };
  }

  /**
   * Queue depth, oldest pending age, retries and failure rate, plus `emailDelivery`: how many email
   * attempts were sent, skipped as already sent, refused, or left with an unknown outcome. A non-zero
   * `unknown` is a recipient who may have missed an email. The counts are this replica's, since it
   * started.
   */
  @Get('metrics')
  async metrics(): Promise<WorkerMetrics> {
    return { ...(await this.relay.outbox().metrics()), emailDelivery: this.deliveries.snapshot() };
  }
}
