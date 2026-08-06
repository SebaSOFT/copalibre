import {
  HEARTBEAT_PRESENTATION,
  heartbeatStatus,
  type HeartbeatStatus,
} from '../lib/device-heartbeat.js';
import type { DisplayTokenResponse } from '../lib/api-client.js';

const BADGE_ACCENT: Readonly<Record<HeartbeatStatus, string>> = {
  online: 'cl-state--live',
  stale: 'cl-state--destructive',
  'never-seen': 'cl-state--muted',
  revoked: 'cl-state--muted',
};

/**
 * The A1 dashboard's `/tv/**` device-health panel (0031, task 4.4).
 *
 * The kiosk screen itself never shows a status — silent recovery is the whole
 * point of that surface — so this is the only place an operator learns a
 * device has gone dark.
 */
export function DeviceHeartbeat({
  devices,
  now,
}: {
  readonly devices: readonly {
    readonly tournamentAlias: string;
    readonly token: DisplayTokenResponse;
  }[];
  /** The caller's clock — read once in an effect, never inside render. */
  readonly now: number;
}): React.JSX.Element {
  return (
    <section aria-label="Estado de pantallas TV">
      <h2>Pantallas TV</h2>
      {devices.length === 0 && <p>No hay dispositivos TV provisionados todavía.</p>}
      <ul>
        {devices.map(({ tournamentAlias, token }) => {
          const status = heartbeatStatus(token, now);
          const presentation = HEARTBEAT_PRESENTATION[status];
          return (
            <li key={token.displayTokenId}>
              <span className={`cl-badge ${BADGE_ACCENT[status]}`}>{presentation.label}</span>{' '}
              <span>{token.label ?? token.displayTokenId}</span> <span>({tournamentAlias})</span>
              {token.lastSeenAt !== undefined && (
                <>
                  {' — última señal '}
                  <time dateTime={token.lastSeenAt}>{token.lastSeenAt}</time>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
