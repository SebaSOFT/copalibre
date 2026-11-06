import { isSupportedLanguage, type SupportedLanguage } from '@copalibre/domain';
import { fetchOrganizations } from './public-api-client.js';

/**
 * A TV route carries no locale segment and no visitor preference, so the query
 * decides, then the organization's primary language, then English.
 */
export function tvLanguage(
  requested: string | null,
  organizationPrimaryLanguage?: string,
): SupportedLanguage {
  if (isSupportedLanguage(requested)) return requested;
  return isSupportedLanguage(organizationPrimaryLanguage) ? organizationPrimaryLanguage : 'en';
}

/** Reads the organization only when the query names no language; a failed read leaves English. */
export async function loadTvLanguage(
  requested: string | null,
  organizationAlias: string,
): Promise<SupportedLanguage> {
  if (isSupportedLanguage(requested)) return requested;
  try {
    const organizations = await fetchOrganizations();
    return tvLanguage(
      requested,
      organizations?.find((one) => one.alias === organizationAlias)?.primaryLanguage,
    );
  } catch {
    return 'en';
  }
}
