import { isSupportedLanguage, type SupportedLanguage } from '@copalibre/domain';
import type { Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { EmailBrandingContext } from '../invitations/email-delivery.js';

/**
 * The header identity and language of an organization's emails: its name, alias, emblem presence and
 * `primary_language`. Undefined for an id that is not an organization (`SYSTEM_ORGANIZATION`, used by
 * password resets), which then renders with the Copa Libre mark only and in English.
 */
export async function loadOrganizationBranding(
  db: Kysely<Database>,
  organizationId: string,
): Promise<(EmailBrandingContext & { readonly language: SupportedLanguage }) | undefined> {
  const row = await db
    .selectFrom('organizations')
    .select(['name', 'alias', 'primary_language', 'emblem_object_id'])
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    language: isSupportedLanguage(row.primary_language) ? row.primary_language : 'en',
    organization: { alias: row.alias, name: row.name, hasEmblem: row.emblem_object_id !== null },
  };
}
