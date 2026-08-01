import { Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { DeadLetter, RelayMetrics } from '@copalibre/persistence';
import { RelayService } from './relay.service.js';

/**
 * The operator's view of what failed (0017).
 *
 * A dead letter is *inspected*, never dropped: a queue that discards what it
 * cannot process is a queue that loses a finalized match and tells nobody. And
 * re-enqueueing is explicit — retries were already exhausted, so retrying again
 * without somebody deciding that something changed is the same failure on a
 * timer.
 */
@Controller('jobs')
export class DeadLetterController {
  constructor(private readonly relay: RelayService) {}

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

  /** Queue depth, oldest pending age, retries and failure rate. */
  @Get('metrics')
  async metrics(): Promise<RelayMetrics> {
    return this.relay.outbox().metrics();
  }
}
