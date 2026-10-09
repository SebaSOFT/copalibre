/**
 * How one email delivery attempt ended. `rejected` is a definite refusal by the provider (the
 * reservation is given back and the job retries); `unknown` is every other failure, where the provider
 * may have accepted the message and the recipient is not retried.
 */
export type DeliveryOutcomeLabel = 'sent' | 'already-sent' | 'unknown' | 'rejected';

export const DELIVERY_OUTCOME_LABELS: readonly DeliveryOutcomeLabel[] = [
  'sent',
  'already-sent',
  'unknown',
  'rejected',
];

export type DeliveryOutcomeCounts = Readonly<Record<DeliveryOutcomeLabel, number>>;

/**
 * Process-local tally of delivery attempts by outcome, so an operator can see how many recipients may
 * not have received an email and alert on a non-zero `unknown`. It resets on restart and is per
 * replica: it is a rate to alert on, not a durable ledger of who was emailed.
 */
export class DeliveryOutcomeCounters {
  private readonly counts: Record<DeliveryOutcomeLabel, number> = {
    sent: 0,
    'already-sent': 0,
    unknown: 0,
    rejected: 0,
  };

  record(outcome: DeliveryOutcomeLabel): void {
    this.counts[outcome] += 1;
  }

  snapshot(): DeliveryOutcomeCounts {
    return { ...this.counts };
  }
}
