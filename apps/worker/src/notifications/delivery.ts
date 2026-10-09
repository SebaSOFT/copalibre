import { createHash } from 'node:crypto';
import type { Database, OutboxRelay } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  EmailRejectedError,
  sendEmail,
  type EmailDeliveryConfig,
  type EmailMessage,
  type FetchLike,
} from '../invitations/email-delivery.js';
import type { DeliveryOutcomeCounters } from './delivery-outcomes.js';

/** What every email handler needs: the database, the reservation primitives, and an HTTP client. */
export interface EmailHandlerDependencies {
  readonly db: Kysely<Database>;
  readonly relay: Pick<OutboxRelay, 'reserve' | 'release'>;
  readonly fetcher?: FetchLike;
  /** Where an outcome-unknown delivery is reported; defaults to `console.warn`. */
  readonly warn?: (message: string) => void;
  /** Tallies every attempt by outcome; absent where nobody reads the counts. */
  readonly counters?: Pick<DeliveryOutcomeCounters, 'record'>;
}

/** What a delivery is for, carried into the log line so an unknown outcome names its event type. */
export interface DeliveryContext {
  readonly eventType?: string;
}

export type DeliveryOutcome = 'sent' | 'already-sent' | 'unknown';

/**
 * The consumer key of one recipient. The address is hashed so the marker table never stores one, and
 * lowercased so `A@x.test` and `a@x.test` are the same recipient.
 */
export function recipientConsumer(address: string): string {
  return `email:${createHash('sha256').update(address.trim().toLowerCase()).digest('hex')}`;
}

/**
 * Sends one message at most once per `(outbox event, recipient)`.
 *
 * Reserve first, then send: the reservation is an atomic insert, so of two workers (or of a retry and
 * a crashed first attempt) only one may call the provider. The reservation is given back only when the
 * provider definitely refused the message. Any other failure leaves the outcome unknown (the provider
 * may have accepted it), so the reservation stays and the recipient is not retried: a possibly missed
 * email is accepted over a possible duplicate.
 *
 * Every attempt is counted by outcome. An unknown outcome is logged as one structured line carrying the
 * event type, the event id, the recipient's hash and the error class: never the address, and never the
 * error message, which a provider may fill with the address it failed on.
 */
export async function deliverOnce(
  dependencies: Pick<EmailHandlerDependencies, 'relay' | 'fetcher' | 'warn' | 'counters'>,
  config: EmailDeliveryConfig,
  eventId: string,
  message: EmailMessage,
  context: DeliveryContext = {},
): Promise<DeliveryOutcome> {
  const consumer = recipientConsumer(message.to);
  if (!(await dependencies.relay.reserve(consumer, eventId))) {
    dependencies.counters?.record('already-sent');
    return 'already-sent';
  }

  try {
    await sendEmail(config, message, dependencies.fetcher);
    dependencies.counters?.record('sent');
    return 'sent';
  } catch (error) {
    if (error instanceof EmailRejectedError) {
      await dependencies.relay.release(consumer, eventId);
      dependencies.counters?.record('rejected');
      throw error;
    }
    dependencies.counters?.record('unknown');
    (dependencies.warn ?? console.warn)(
      JSON.stringify({
        message: 'Email delivery outcome unknown; not retried',
        eventType: context.eventType ?? null,
        eventId,
        recipient: consumer,
        errorClass: error instanceof Error ? error.constructor.name : typeof error,
      }),
    );
    return 'unknown';
  }
}
