import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type StageResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { TournamentHubTemplate } from '../screens/TournamentHubTemplate.js';

/**
 * The Tournament hub's own data-fetching (mirrors `ZoneGroupPage`, design.md
 * - "Component shape"): `listStages` is optional, same as every other
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

  const [stages, setStages] = useState<readonly StageResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let live = true;
    (api.listStages?.(organizationAlias, tournamentAlias) ?? Promise.resolve([]))
      .then((loaded) => {
        if (!live) return;
        setStages(loaded);
        setLoadError(undefined);
      })
      .catch(() => {
        if (live) setLoadError(intl.formatMessage(messages.tournamentHubLoadFailed));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intl is stable within one ControlIntl mount
  }, [api, organizationAlias, tournamentAlias]);

  if (loading) {
    return <Alert tone="info">{intl.formatMessage(messages.tournamentHubLoading)}</Alert>;
  }

  if (loadError) {
    return <Alert tone="destructive">{loadError}</Alert>;
  }

  return (
    <TournamentHubTemplate
      organizationAlias={organizationAlias}
      stages={stages}
      tournamentAlias={tournamentAlias}
    />
  );
}
