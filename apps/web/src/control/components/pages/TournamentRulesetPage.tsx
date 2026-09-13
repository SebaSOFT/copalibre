import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage } from 'react-intl';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { TournamentRulesetTemplate } from '../screens/TournamentRulesetTemplate.js';
import { messages } from '../../i18n/messages.en.js';

export function TournamentRulesetPage({
  organizationAlias,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const [overrides, setOverrides] = useState<Readonly<Record<string, unknown>> | undefined>(
    undefined,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .fetchRulesetOverrides?.(organizationAlias, tournamentAlias)
      .then((loaded) => {
        if (live) setOverrides(loaded.overrides);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias]);

  if (failed) {
    return (
      <Alert tone="destructive">
        <FormattedMessage {...messages.settingsLoadFailed} />
      </Alert>
    );
  }
  if (overrides === undefined) {
    return (
      <Alert tone="info">
        <FormattedMessage {...messages.settingsLoading} />
      </Alert>
    );
  }

  return (
    <TournamentRulesetTemplate
      onPreview={(request) =>
        api
          .previewRulesetOverrides?.(organizationAlias, tournamentAlias, request)
          .then((result) => result?.fields ?? []) ?? Promise.resolve([])
      }
      onSave={(request) =>
        api
          .updateRulesetOverrides?.(organizationAlias, tournamentAlias, request)
          .then((updated) => {
            if (updated) setOverrides(updated.overrides);
          }) ?? Promise.resolve()
      }
      organizationAlias={organizationAlias}
      overrides={overrides}
      tournamentAlias={tournamentAlias}
    />
  );
}
