/** What either renewal mechanism (native cookie refresh, OIDC silent re-auth) hands back on success. */
export interface SilentRenewalOutcome {
  readonly accessToken: string;
  readonly expiresAtMs: number;
}
