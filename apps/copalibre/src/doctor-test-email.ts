import {
  EmailRejectedError,
  emailDeliveryConfigFromEnv,
  sendEmail,
  testEmailMessage,
  type FetchLike,
} from '@copalibre/email-delivery';
import type { DoctorCheck } from './doctor.js';

const CHECK = 'email:test-send';

/**
 * `doctor --send-test-email <address>`: one email through the delivery code and configuration the
 * worker uses, reporting what the provider answered. It runs in the doctor service, inside the
 * network the worker sends from.
 */
export async function sendTestEmail(
  environment: NodeJS.ProcessEnv,
  address: string,
  fetcher: FetchLike = fetch,
): Promise<DoctorCheck> {
  let config;
  try {
    config = emailDeliveryConfigFromEnv(environment);
  } catch (error) {
    return { name: CHECK, status: 'fail', message: `Email is not configured: ${message(error)}` };
  }
  try {
    await sendEmail(config, testEmailMessage(config, address), fetcher);
    return {
      name: CHECK,
      status: 'pass',
      message: `${config.provider} accepted a test email from ${config.from} to ${address}; check that it arrived, spam folder included`,
    };
  } catch (error) {
    const detail = error instanceof EmailRejectedError && error.detail ? ` (${error.detail})` : '';
    return {
      name: CHECK,
      status: 'fail',
      message:
        error instanceof EmailRejectedError
          ? `${config.provider} refused the test email: ${message(error)}${detail}`
          : `The test email could not be sent through ${config.provider}: ${message(error)}`,
    };
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
