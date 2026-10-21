import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { Button } from '../ui/atoms/button.js';
import { FormattedMessage } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type RulesetOverridesResponse,
  type TournamentSettingsResponse,
} from '../../lib/api-client.js';
import type { ConfigFieldPolicies } from '@copalibre/domain';
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
  const [rulesetLoad, setRulesetLoad] = useState<
    | {
        readonly requestKey: string;
        readonly status: 'loaded';
        readonly ruleset: RulesetOverridesResponse;
      }
    | { readonly requestKey: string; readonly status: 'failed' }
    | undefined
  >(undefined);
  const [settings, setSettings] = useState<TournamentSettingsResponse | undefined>(undefined);
  const [retryKey, setRetryKey] = useState(0);
  const requestKey = JSON.stringify([organizationAlias, tournamentAlias, retryKey]);

  useEffect(() => {
    let live = true;
    const fetchRuleset = api.fetchRulesetOverrides?.(organizationAlias, tournamentAlias);
    Promise.resolve(fetchRuleset)
      .then((loaded) => {
        if (!live) return;
        setRulesetLoad(
          loaded === undefined
            ? { requestKey, status: 'failed' }
            : { requestKey, status: 'loaded', ruleset: loaded },
        );
      })
      .catch(() => {
        if (live) setRulesetLoad({ requestKey, status: 'failed' });
      });
    // Additive context for the plain-language summary —
    // never gates loading/failed state, which stays keyed to the ruleset request only.
    api
      .fetchTournamentSettings?.(organizationAlias, tournamentAlias)
      .then((loaded) => {
        if (live) setSettings(loaded);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, organizationAlias, requestKey, tournamentAlias]);

  const currentRulesetLoad = rulesetLoad?.requestKey === requestKey ? rulesetLoad : undefined;
  if (currentRulesetLoad?.status === 'failed') {
    return (
      <Alert tone="destructive">
        <FormattedMessage {...messages.settingsLoadFailed} />
        <Button onClick={() => setRetryKey((key) => key + 1)}>
          <FormattedMessage {...messages.rulesetRetry} />
        </Button>
      </Alert>
    );
  }
  if (currentRulesetLoad?.status !== 'loaded') {
    return (
      <Alert tone="info">
        <FormattedMessage {...messages.settingsLoading} />
      </Alert>
    );
  }
  const ruleset = currentRulesetLoad.ruleset;

  return (
    <TournamentRulesetTemplate
      disciplineDefaults={ruleset.disciplineDefaults}
      fieldPolicies={ruleset.fieldPolicies as ConfigFieldPolicies}
      onPreview={(request) =>
        api
          .previewRulesetOverrides?.(organizationAlias, tournamentAlias, request)
          .then((result) => result?.fields ?? []) ?? Promise.resolve([])
      }
      onSave={(request) =>
        api
          .updateRulesetOverrides?.(organizationAlias, tournamentAlias, request)
          .then((updated) => {
            if (updated) setRulesetLoad({ requestKey, status: 'loaded', ruleset: updated });
          }) ?? Promise.resolve()
      }
      organizationAlias={organizationAlias}
      overrides={ruleset.overrides}
      settings={settings}
      tournamentAlias={tournamentAlias}
    />
  );
}
