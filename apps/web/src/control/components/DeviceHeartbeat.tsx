import { FormattedMessage, useIntl } from 'react-intl';
import {
  HEARTBEAT_PRESENTATION,
  heartbeatStatus,
  type HeartbeatStatus,
} from '../lib/device-heartbeat.js';
import type { DisplayTokenResponse } from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';

const BADGE_ACCENT: Readonly<Record<HeartbeatStatus, string>> = {
  online: 'cl-state--live',
  stale: 'cl-state--destructive',
  'never-seen': 'cl-state--muted',
  revoked: 'cl-state--muted',
};

/**
 * The A1 dashboard's `/tv/**` device-health panel.
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
  const intl = useIntl();
  return (
    <section aria-label={intl.formatMessage(messages.deviceHeartbeatSectionLabel)}>
      <h2>
        <FormattedMessage {...messages.deviceHeartbeatTitle} />
      </h2>
      {devices.length === 0 && (
        <p>
          <FormattedMessage {...messages.deviceHeartbeatEmpty} />
        </p>
      )}
      <ul>
        {devices.map(({ tournamentAlias, token }) => {
          const status = heartbeatStatus(token, now);
          const presentation = HEARTBEAT_PRESENTATION[status];
          return (
            <li key={token.displayTokenId}>
              <span className={`cl-badge ${BADGE_ACCENT[status]}`}>
                {intl.formatMessage(presentation.label)}
              </span>{' '}
              <span>{token.label ?? token.displayTokenId}</span> <span>({tournamentAlias})</span>
              {token.lastSeenAt !== undefined && (
                <>
                  {' — '}
                  <FormattedMessage {...messages.deviceHeartbeatLastSeen} />{' '}
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
