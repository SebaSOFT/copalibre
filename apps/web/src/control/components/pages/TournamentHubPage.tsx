import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type StageResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { TournamentHubTemplate } from '../screens/TournamentHubTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * The Tournament hub's own data-fetching (mirrors `ZoneGroupPage`): `listStages` is optional, same as every other
 * `ControlApiClient` capability a client may not implement yet.
 */
export function TournamentHubPage({
  organizationAlias,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
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

  const requestKey = `control-tournament-hub:${organizationAlias}:${tournamentAlias}`;
  const read = useResilientRead(
    requestKey,
    () => api.listStages?.(organizationAlias, tournamentAlias) ?? Promise.resolve([]),
    { thing: intl.formatMessage(messages.tournamentHubTitle) },
  );
  const tournamentRead = useResilientRead(
    `control-tournament-hub-name:${organizationAlias}:${tournamentAlias}`,
    () =>
      api.fetchTournamentSettings?.(organizationAlias, tournamentAlias) ??
      Promise.resolve(undefined),
    { thing: intl.formatMessage(messages.tournamentHubTitle) },
  );

  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.tournamentHubTitle)} />;
  return (
    <ReadState {...read} title={intl.formatMessage(messages.tournamentHubTitle)}>
      <TournamentHubTemplate
        organizationAlias={organizationAlias}
        stages={read.data as readonly StageResponse[]}
        tournamentAlias={tournamentAlias}
        tournamentName={tournamentRead.data?.name}
      />
    </ReadState>
  );
}
