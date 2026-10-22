import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { LiveConsoleTemplate } from '../screens/LiveConsoleTemplate.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * Fetches: the active-tournament load lives here;
 * `LiveConsoleTemplate` composes the screen from the resulting data.
 */
export function LiveConsolePage({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );

  const read = useResilientRead(
    `control-live-console:${organizationAlias}`,
    () => {
      const listTournaments = api.listActiveTournaments;
      return listTournaments ? listTournaments(organizationAlias) : Promise.resolve([]);
    },
    {
      thing: intl.formatMessage(messages.navLiveConsole),
      isEmpty: (tournaments) => tournaments.length === 0,
    },
  );

  return (
    <LiveConsoleTemplate
      failed={read.status === 'failed-empty'}
      loading={read.status === 'loading'}
      organizationAlias={organizationAlias}
      onRetry={read.retry}
      staleSince={read.status === 'stale' ? read.staleSince : undefined}
      tournaments={read.data ?? []}
    />
  );
}
