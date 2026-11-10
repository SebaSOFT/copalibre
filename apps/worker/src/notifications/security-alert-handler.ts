import {
  recordSecurityAlert,
  refusalBursts,
  securityAlertRaisedSince,
  type Database,
  type RefusalBurst,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { JobHandler } from '../jobs/dispatcher.js';
import type { EmailDeliveryConfig } from '../invitations/email-delivery.js';
import { renderEmail } from './email-layout.js';
import { deliverOnce, type EmailHandlerDependencies } from './delivery.js';

/** The scheduled event that runs the check. */
export const SECURITY_REFUSAL_CHECK_EVENT = 'security.refusals.check';

export interface SecurityAlertConfig {
  /** Where alerts are emailed; absent means alerts are logged only. */
  readonly recipient?: string;
  /** Refusals from one actor within the window that raise an alert. */
  readonly threshold: number;
  readonly windowMinutes: number;
}

export const DEFAULT_SECURITY_ALERT_THRESHOLD = 20;
export const DEFAULT_SECURITY_ALERT_WINDOW_MINUTES = 10;

/**
 * Reads `COPALIBRE_SECURITY_ALERT_EMAIL` and `COPALIBRE_SECURITY_ALERT_THRESHOLD`.
 * A threshold that is not a whole number of at least 2 refuses to start, so a
 * typo cannot silence alerting.
 */
export function securityAlertConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SecurityAlertConfig {
  const rawThreshold = env.COPALIBRE_SECURITY_ALERT_THRESHOLD?.trim();
  const threshold =
    rawThreshold === undefined || rawThreshold === ''
      ? DEFAULT_SECURITY_ALERT_THRESHOLD
      : Number(rawThreshold);
  if (!Number.isInteger(threshold) || threshold < 2) {
    throw new Error('COPALIBRE_SECURITY_ALERT_THRESHOLD must be a whole number of at least 2');
  }
  const recipient = env.COPALIBRE_SECURITY_ALERT_EMAIL?.trim();
  return {
    ...(recipient ? { recipient } : {}),
    threshold,
    windowMinutes: DEFAULT_SECURITY_ALERT_WINDOW_MINUTES,
  };
}

/**
 * The structured line every alert writes, whether or not it is also emailed.
 * It names the actor (a principal id, or `unauthenticated`), the count and the
 * paths, never a credential, a body or an email address.
 */
export function securityAlertLogLine(burst: RefusalBurst, windowMinutes: number): string {
  return JSON.stringify({
    event: 'security.alert',
    actor: burst.actor,
    refusals: burst.refusals,
    windowMinutes,
    topPaths: burst.topPaths,
  });
}

function describe(burst: RefusalBurst, windowMinutes: number): string {
  const who =
    burst.actor === 'unauthenticated'
      ? 'Requests with no valid credentials'
      : `The account ${burst.actor}`;
  const paths = burst.topPaths.join(', ') || 'no path recorded';
  return `${who}: ${burst.refusals} refused in ${windowMinutes} minutes, most on ${paths}.`;
}

function alertMessage(
  config: EmailDeliveryConfig,
  to: string,
  bursts: readonly RefusalBurst[],
  windowMinutes: number,
) {
  const total = bursts.reduce((sum, burst) => sum + burst.refusals, 0);
  return renderEmail(config, {
    to,
    subject: `CopaLibre security alert: ${total} refused requests`,
    language: 'en',
    heading: 'Repeated refused requests',
    paragraphs: [
      ...bursts.map((burst) => describe(burst, windowMinutes)),
      'Follow the response steps in the security runbook: check the audit trail, then revoke the account or block the source at the edge if the requests are not expected.',
    ],
    action: {
      label: 'Open the audit trail',
      url: new URL('/control/platform', config.appUrl).toString(),
    },
  });
}

export interface SecurityAlertDependencies extends Pick<
  EmailHandlerDependencies,
  'relay' | 'fetcher' | 'warn' | 'counters'
> {
  readonly db: Kysely<Database>;
  readonly log?: (line: string) => void;
  readonly now?: () => Date;
}

/**
 * Raises one alert per actor whose refusals cross the threshold within the
 * window, and not again for the same actor until the window has passed.
 */
export function securityAlertHandler(
  emailConfig: EmailDeliveryConfig,
  alertConfig: SecurityAlertConfig,
  dependencies: SecurityAlertDependencies,
): JobHandler {
  const log = dependencies.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  return async (job) => {
    const now = dependencies.now?.() ?? new Date();
    const since = new Date(now.getTime() - alertConfig.windowMinutes * 60_000);
    const bursts = await refusalBursts(dependencies.db, {
      since,
      threshold: alertConfig.threshold,
    });
    const raised: RefusalBurst[] = [];
    for (const burst of bursts) {
      if (await securityAlertRaisedSince(dependencies.db, burst.actor, since)) continue;
      await recordSecurityAlert(dependencies.db, burst, alertConfig.windowMinutes);
      log(securityAlertLogLine(burst, alertConfig.windowMinutes));
      raised.push(burst);
    }
    // One email per check, delivered at most once for this scheduled event.
    if (raised.length > 0 && alertConfig.recipient) {
      await deliverOnce(
        dependencies,
        emailConfig,
        job.eventId,
        alertMessage(emailConfig, alertConfig.recipient, raised, alertConfig.windowMinutes),
        { eventType: job.eventType },
      );
    }
  };
}
