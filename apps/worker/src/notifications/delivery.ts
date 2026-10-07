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

/** What every email handler needs: the database, the reservation primitives, and an HTTP client. */
export interface EmailHandlerDependencies {
  readonly db: Kysely<Database>;
  readonly relay: Pick<OutboxRelay, 'reserve' | 'release'>;
  readonly fetcher?: FetchLike;
  /** Where an outcome-unknown delivery is reported; defaults to `console.warn`. */
  readonly warn?: (message: string) => void;
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
 */
export async function deliverOnce(
  dependencies: Pick<EmailHandlerDependencies, 'relay' | 'fetcher' | 'warn'>,
  config: EmailDeliveryConfig,
  eventId: string,
  message: EmailMessage,
): Promise<DeliveryOutcome> {
  const consumer = recipientConsumer(message.to);
  if (!(await dependencies.relay.reserve(consumer, eventId))) return 'already-sent';

  try {
    await sendEmail(config, message, dependencies.fetcher);
    return 'sent';
  } catch (error) {
    if (error instanceof EmailRejectedError) {
      await dependencies.relay.release(consumer, eventId);
      throw error;
    }
    (dependencies.warn ?? console.warn)(
      `Email delivery outcome unknown for event ${eventId} (recipient ${consumer}); not retried: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 'unknown';
  }
}
