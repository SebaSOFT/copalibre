/** What either renewal mechanism (native cookie refresh, OIDC silent re-auth) hands back on success. */
export interface SilentRenewalOutcome {
  readonly accessToken: string;
  readonly expiresAtMs: number;
}

/** A rate-limited renewal that should retry without ending the current session. */
export interface SilentRenewalRetry {
  readonly retryAtMs: number;
}

export type SilentRenewalResult = SilentRenewalOutcome | SilentRenewalRetry;
