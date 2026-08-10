import { Controller, Get, Inject } from '@nestjs/common';
import { SchedulerService } from './scheduler.service.js';
import type { LeaseState } from './lease-state.js';

/**
 * Which replica is scheduling, and whether this one is. Exposed because "who
 * holds the lease" is the first question asked when a periodic job did not run,
 * and reading it off the database by hand is a poor substitute.
 */
@Controller('scheduler')
export class LeaseController {
  constructor(@Inject(SchedulerService) private readonly scheduler: SchedulerService) {}

  @Get('lease')
  lease(): { replica: string; state: LeaseState } {
    return { replica: this.scheduler.replicaId, state: this.scheduler.leaseState() };
  }
}
