import type { JobHandler } from '../jobs/dispatcher.js';
import { payloadOf } from '../jobs/relay-runner.js';
import {
  invitationMessage,
  passwordResetMessage,
  type EmailDeliveryConfig,
  type InvitationPayload,
  type PasswordResetPayload,
} from '../invitations/email-delivery.js';
import { deliverOnce, type EmailHandlerDependencies } from './delivery.js';
import { loadOrganizationBranding } from './organization.js';

/** Invitation email, in the invited organization's language, delivered at most once per recipient. */
export function invitationEmailHandler(
  config: EmailDeliveryConfig,
  dependencies: EmailHandlerDependencies,
): JobHandler {
  return async (job) => {
    const payload = payloadOf<InvitationPayload>(job);
    assertInvitationPayload(payload);
    const branding = await loadOrganizationBranding(dependencies.db, job.organizationId);
    await deliverOnce(
      dependencies,
      config,
      job.eventId,
      invitationMessage(config, payload, branding ?? {}),
      { eventType: job.eventType },
    );
  };
}

/** Password-reset email: principal-scoped, so English with the Copa Libre mark only. */
export function passwordResetEmailHandler(
  config: EmailDeliveryConfig,
  dependencies: EmailHandlerDependencies,
): JobHandler {
  return async (job) => {
    const payload = payloadOf<PasswordResetPayload>(job);
    assertPasswordResetPayload(payload);
    await deliverOnce(dependencies, config, job.eventId, passwordResetMessage(config, payload), {
      eventType: job.eventType,
    });
  };
}

function assertInvitationPayload(payload: InvitationPayload): void {
  if (
    typeof payload.invitationId !== 'string' ||
    typeof payload.recipientEmail !== 'string' ||
    typeof payload.token !== 'string' ||
    typeof payload.expiresAt !== 'string'
  ) {
    throw new Error('organization.invite.requested payload is invalid');
  }
}

function assertPasswordResetPayload(payload: PasswordResetPayload): void {
  if (
    typeof payload.verificationId !== 'string' ||
    typeof payload.recipientEmail !== 'string' ||
    typeof payload.token !== 'string' ||
    typeof payload.expiresAt !== 'string'
  ) {
    throw new Error('password-reset-requested payload is invalid');
  }
}
