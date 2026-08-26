import type { MessageDescriptor } from 'react-intl';
import { messages } from '../i18n/messages.en.js';

/**
 * Device-health status for `/tv/**` kiosks, surfaced in the A1 dashboard
 * rather than on the kiosk screen itself — the kiosk never
 * shows a status of its own, silent failure being the whole point of that
 * surface; an operator watches for a dead device from here instead.
 */
export type HeartbeatStatus = 'online' | 'stale' | 'never-seen' | 'revoked';

export interface DisplayTokenHealth {
  readonly revoked: boolean;
  readonly lastSeenAt?: string;
}

// Long enough that one reconnect/backoff cycle doesn't flap a healthy device
// to "stale" and back; short enough that a dead kiosk is noticed within about
// three heartbeat intervals (`TvDashboard`'s stream considers itself stale
// after 30s) rather than sitting dark for the length of a whole match.
const STALE_AFTER_MS = 90_000;

export function heartbeatStatus(token: DisplayTokenHealth, now: number): HeartbeatStatus {
  if (token.revoked) return 'revoked';
  if (token.lastSeenAt === undefined) return 'never-seen';
  return now - Date.parse(token.lastSeenAt) > STALE_AFTER_MS ? 'stale' : 'online';
}

export const HEARTBEAT_PRESENTATION: Readonly<
  Record<HeartbeatStatus, { readonly label: MessageDescriptor }>
> = {
  online: { label: messages.heartbeatOnline },
  stale: { label: messages.heartbeatStale },
  'never-seen': { label: messages.heartbeatNeverSeen },
  revoked: { label: messages.heartbeatRevoked },
};
