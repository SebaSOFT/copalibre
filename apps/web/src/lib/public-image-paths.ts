/** Same-origin public image routes that can be used in server and browser bundles. */
export function organizationEmblemUrl(organizationAlias: string): string {
  return `/organizations/${encodeURIComponent(organizationAlias)}/emblem`;
}

export function clubEmblemUrl(organizationAlias: string, clubId: string): string {
  return `/organizations/${encodeURIComponent(organizationAlias)}/clubs/${encodeURIComponent(clubId)}/emblem`;
}
