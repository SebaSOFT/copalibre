import { API_PATH_PREFIX } from './api-path.ts';

/** Same-origin public image routes that can be used in server and browser bundles. */
export function organizationEmblemUrl(organizationAlias: string): string {
  return `${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/emblem`;
}

export function clubEmblemUrl(organizationAlias: string, clubId: string): string {
  return `${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/emblem`;
}
