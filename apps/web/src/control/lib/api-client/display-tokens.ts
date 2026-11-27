import { requestJson } from './transport.js';
import type { EndpointDeps } from './transport.js';

export interface DisplayTokenResponse {
  readonly displayTokenId: string;
  readonly tournamentId: string;
  readonly matchId?: string;
  readonly label?: string;
  readonly revoked: boolean;
  readonly lastSeenAt?: string;
  readonly createdAt: string;
}

export interface IssueDisplayTokenRequest {
  /** Pins the device to one match, not the full tournament rotation. */
  readonly matchId?: string;
  /** Operator-facing device label, e.g. "Cancha 1 - TV entrada". */
  readonly label?: string;
}

export interface DisplayTokenIssuedResponse {
  readonly displayTokenId: string;
  /** Shown once. Provision the device with it; it is never stored raw. */
  readonly token: string;
  /** The `/tv/**` launch URL to configure on the device. */
  readonly url: string;
  readonly label?: string;
}

export interface DisplayTokensApi {
  /** The A1 dashboard's device-health panel reads this per tournament. */
  readonly listDisplayTokens?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<readonly DisplayTokenResponse[]>;

  /**
   * Issues a device-scoped `/tv/**` token (the Broadcaster
   * Studio, but not exclusive to it — a kiosk device uses the same call).
   * The raw token and its ready-to-use launch URL are returned once; neither
   * is retrievable again afterward.
   */
  readonly issueDisplayToken?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: IssueDisplayTokenRequest,
  ) => Promise<DisplayTokenIssuedResponse>;

  readonly revokeDisplayToken?: (
    organizationAlias: string,
    tournamentAlias: string,
    displayTokenId: string,
  ) => Promise<DisplayTokenResponse>;
}

export function displayTokensEndpoints({ fetch, baseUrl }: EndpointDeps): DisplayTokensApi {
  return {
    listDisplayTokens: (organizationAlias, tournamentAlias) =>
      requestJson<readonly DisplayTokenResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/display-tokens`,
      ),

    issueDisplayToken: (organizationAlias, tournamentAlias, body) =>
      requestJson<DisplayTokenIssuedResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/display-tokens`,
        { method: 'POST', body },
      ),

    revokeDisplayToken: (organizationAlias, tournamentAlias, displayTokenId) =>
      requestJson<DisplayTokenResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/display-tokens/${encodeURIComponent(displayTokenId)}`,
        { method: 'DELETE' },
      ),
  };
}
