import type { SupportedLanguage } from '@copalibre/domain';
import type { EmailDeliveryConfig, EmailMessage } from '../invitations/email-delivery.js';
import { emailCopy } from './email-copy.js';

/** The organization an email concerns, as the header shows it. Absent for a password reset. */
export interface EmailOrganization {
  readonly alias: string;
  readonly name: string;
  readonly hasEmblem: boolean;
}

export interface EmailContent {
  readonly to: string;
  readonly subject: string;
  readonly language: SupportedLanguage;
  readonly organization?: EmailOrganization;
  readonly heading: string;
  /** Plain paragraphs; escaped here, never interpolated raw. */
  readonly paragraphs: readonly string[];
  readonly action?: { readonly label: string; readonly url: string };
}

const PRODUCT_URL = 'https://copalibre.app';
const LOGO_PATH = '/copalibre-logo.png';

/**
 * The one layout every email renders through (lifecycle, invitation, password reset): organization
 * header, body, Copa Libre signature. Table-based, inline-styled and image-optional — every image has
 * `alt` text, so the message reads the same where a client blocks remote images.
 *
 * The header and body links use the installation's `COPALIBRE_APP_URL`; the signature link is always
 * `copalibre.app`, because it signs the product rather than the installation.
 */
export function renderEmail(config: EmailDeliveryConfig, content: EmailContent): EmailMessage {
  const copy = emailCopy(content.language);
  const organization = content.organization;
  const organizationUrl = organization
    ? organizationPageUrl(config, organization, content)
    : undefined;
  const emblemUrl =
    organization?.hasEmblem === true
      ? new URL(`/organizations/${encodeURIComponent(organization.alias)}/emblem`, config.appUrl)
      : undefined;
  const logoUrl = new URL(LOGO_PATH, config.appUrl).toString();

  const text = [
    ...(organization ? [organization.name, organizationUrl ?? ''] : ['Copa Libre']),
    '',
    content.heading,
    ...content.paragraphs,
    ...(content.action ? ['', `${content.action.label}: ${content.action.url}`] : []),
    '',
    `-- ${copy.sentBy}`,
    PRODUCT_URL,
  ].join('\n');

  const header = organization
    ? `<a href="${escapeHtml(organizationUrl ?? '')}" style="color:#0b1f33;text-decoration:none;">${
        emblemUrl
          ? `<img src="${escapeHtml(emblemUrl.toString())}" alt="${escapeHtml(organization.name)}" width="40" height="40" style="vertical-align:middle;border:0;margin-right:12px;" />`
          : ''
      }<span style="font-size:18px;font-weight:700;vertical-align:middle;">${escapeHtml(organization.name)}</span></a>`
    : `<img src="${escapeHtml(logoUrl)}" alt="Copa Libre" width="40" height="40" style="vertical-align:middle;border:0;" />`;

  const action = content.action
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;padding:10px 18px;background:#0b6bcb;color:#ffffff;text-decoration:none;border-radius:4px;">${escapeHtml(content.action.label)}</a></p>`
    : '';

  const html =
    `<!doctype html><html lang="${content.language}"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#0b1f33;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;">` +
    `<tr><td style="padding:20px 24px;border-bottom:1px solid #d8dee4;">${header}</td></tr>` +
    `<tr><td style="padding:24px;"><h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(content.heading)}</h1>` +
    content.paragraphs
      .map((paragraph) => `<p style="margin:0 0 12px;">${escapeHtml(paragraph)}</p>`)
      .join('') +
    `${action}</td></tr>` +
    `<tr><td style="padding:16px 24px;border-top:1px solid #d8dee4;font-size:12px;color:#5b6b7a;">` +
    `<img src="${escapeHtml(logoUrl)}" alt="Copa Libre" width="24" height="24" style="vertical-align:middle;border:0;margin-right:8px;" />` +
    `${escapeHtml(copy.sentBy)} · <a href="${PRODUCT_URL}" style="color:#5b6b7a;">copalibre.app</a></td></tr>` +
    `</table></body></html>`;

  return { to: content.to, subject: content.subject, text, html };
}

/** English is unprefixed; every other language is routed under its code, as the public site is. */
function organizationPageUrl(
  config: EmailDeliveryConfig,
  organization: EmailOrganization,
  content: EmailContent,
): string {
  const prefix = content.language === 'en' ? '' : `/${content.language}`;
  return new URL(`${prefix}/${encodeURIComponent(organization.alias)}`, config.appUrl).toString();
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
