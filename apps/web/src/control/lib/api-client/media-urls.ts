import { API_PATH_PREFIX } from '../../../lib/api-path.js';

/** Public, unauthenticated image routes — safe to use directly as an `<img src>`. */
export function personPhotoUrl(
  organizationAlias: string,
  personId: string,
  baseUrl = '',
  objectId?: string,
): string {
  const query = objectId ? `?v=${encodeURIComponent(objectId)}` : '';
  return `${baseUrl}${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/persons/${encodeURIComponent(personId)}/photo${query}`;
}

export function clubEmblemUrl(
  organizationAlias: string,
  clubId: string,
  baseUrl = '',
  objectId?: string,
): string {
  const query = objectId ? `?v=${encodeURIComponent(objectId)}` : '';
  return `${baseUrl}${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/emblem${query}`;
}

export function organizationEmblemUrl(
  organizationAlias: string,
  baseUrl = '',
  objectId?: string,
): string {
  const query = objectId ? `?v=${encodeURIComponent(objectId)}` : '';
  return `${baseUrl}${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/emblem${query}`;
}

export function tournamentEmblemUrl(
  organizationAlias: string,
  tournamentAlias: string,
  baseUrl = '',
  objectId?: string,
): string {
  const query = objectId ? `?v=${encodeURIComponent(objectId)}` : '';
  return `${baseUrl}${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/emblem${query}`;
}
