import type { SupportedLanguage } from '@copalibre/domain';
import type { EmailDeliveryConfig, EmailMessage } from '@copalibre/email-delivery';
import { emailCopy } from '../notifications/email-copy.js';
import { formatEmailExpiry } from '../notifications/email-date.js';
import { renderEmail, type EmailOrganization } from '../notifications/email-layout.js';

// The transport lives in @copalibre/email-delivery, which doctor's test email uses too.
export {
  EmailRejectedError,
  emailDeliveryConfigFromEnv,
  isSmtpRefusal,
  sendEmail,
  type EmailDeliveryConfig,
  type EmailMessage,
  type EmailProvider,
  type FetchLike,
} from '@copalibre/email-delivery';

export interface InvitationPayload {
  readonly invitationId: string;
  readonly recipientEmail: string;
  readonly token: string;
  readonly expiresAt: string;
}

export interface PasswordResetPayload {
  readonly verificationId: string;
  readonly recipientEmail: string;
  readonly token: string;
  readonly expiresAt: string;
}

/** Who and in which language an email speaks; absent means English with the CopaLibre mark only. */
export interface EmailBrandingContext {
  readonly organization?: EmailOrganization;
  readonly language?: SupportedLanguage;
  /** The organization's IANA zone, for dates in its emails; absent means UTC. */
  readonly timeZone?: string;
}

/** Creates the queued invitation email without persisting or logging its token. */
export function invitationMessage(
  config: EmailDeliveryConfig,
  payload: InvitationPayload,
  context: EmailBrandingContext = {},
): EmailMessage {
  const language = context.language ?? 'en';
  const copy = emailCopy(language).invitation;
  const url = new URL('/invitations/accept', config.appUrl);
  url.searchParams.set('token', payload.token);
  const expiresAt = formatEmailExpiry(payload.expiresAt, language, context.timeZone ?? 'UTC');
  return renderEmail(config, {
    to: payload.recipientEmail,
    subject: copy.subject,
    language,
    ...(context.organization ? { organization: context.organization } : {}),
    heading: copy.heading,
    paragraphs: [copy.body, copy.expires(expiresAt)],
    action: { label: copy.action, url: url.toString() },
  });
}

/** Creates the queued password-reset email without persisting or logging its token. */
export function passwordResetMessage(
  config: EmailDeliveryConfig,
  payload: PasswordResetPayload,
): EmailMessage {
  // A reset is principal-scoped, with no organization and so no organization language.
  const copy = emailCopy('en').passwordReset;
  const url = new URL('/control/reset-password', config.appUrl);
  url.searchParams.set('token', payload.token);
  const expiresAt = formatEmailExpiry(payload.expiresAt, 'en', 'UTC');
  return renderEmail(config, {
    to: payload.recipientEmail,
    subject: copy.subject,
    language: 'en',
    heading: copy.heading,
    paragraphs: [copy.body, copy.expires(expiresAt), copy.ignore],
    action: { label: copy.action, url: url.toString() },
  });
}
