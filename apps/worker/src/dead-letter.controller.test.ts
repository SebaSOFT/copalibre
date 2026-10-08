import type { RelayMetrics } from '@copalibre/persistence';
import { DeadLetterController } from './dead-letter.controller.js';
import { DeliveryOutcomeCounters } from './notifications/delivery-outcomes.js';
import type { RelayService } from './relay.service.js';

const RELAY_METRICS: RelayMetrics = {
  queueDepth: 3,
  oldestPendingSeconds: 12,
  inFlight: 1,
  deadLettered: 0,
  retries: 2,
  failureRate: 0.1,
};

function controller(counters: DeliveryOutcomeCounters): DeadLetterController {
  const relay = {
    outbox: () => ({ metrics: async () => RELAY_METRICS }),
  } as unknown as RelayService;
  return new DeadLetterController(relay, counters);
}

describe('GET /jobs/metrics', () => {
  it('keeps every relay figure and adds the email delivery outcomes under their own key', async () => {
    const counters = new DeliveryOutcomeCounters();
    counters.record('sent');
    counters.record('unknown');

    const metrics = await controller(counters).metrics();

    expect(metrics).toEqual({
      ...RELAY_METRICS,
      emailDelivery: { sent: 1, 'already-sent': 0, unknown: 1, rejected: 0 },
    });
  });

  it('reports zeros before any email was attempted', async () => {
    const metrics = await controller(new DeliveryOutcomeCounters()).metrics();

    expect(metrics.emailDelivery).toEqual({ sent: 0, 'already-sent': 0, unknown: 0, rejected: 0 });
  });
});
