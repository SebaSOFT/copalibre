import type { ConfigFieldPolicies } from '@copalibre/domain';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type RulesetOverridesResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { TournamentRulesetTemplate } from '../screens/TournamentRulesetTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { replaceResilientReadCache, useResilientRead } from './use-resilient-read.js';

export function TournamentRulesetPage({
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
  const requestKey = `control-tournament-ruleset:${organizationAlias}:${tournamentAlias}`;
  const read = useResilientRead(
    requestKey,
    async () => {
      if (!api.fetchRulesetOverrides) throw new Error('Tournament ruleset is unavailable');
      const ruleset = await api.fetchRulesetOverrides(organizationAlias, tournamentAlias);
      if (!ruleset) throw new Error('Tournament ruleset is unavailable');
      // Settings only enrich the plain-language summary and never gate the ruleset.
      const settings = await (
        api.fetchTournamentSettings?.(organizationAlias, tournamentAlias) ??
        Promise.resolve(undefined)
      ).catch(() => undefined);
      return { ruleset, settings };
    },
    {
      thing: intl.formatMessage(messages.settingsTitle),
      onSuccess: () => setRulesetOverride(undefined),
    },
  );
  const [rulesetOverride, setRulesetOverride] = useState<
    { readonly requestKey: string; readonly ruleset: RulesetOverridesResponse } | undefined
  >(undefined);
  const ruleset =
    rulesetOverride?.requestKey === requestKey ? rulesetOverride.ruleset : read.data?.ruleset;
  const settings = read.data?.settings;

  if (ruleset === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.settingsTitle)} />;
  return (
    <ReadState {...read} title={intl.formatMessage(messages.settingsTitle)}>
      <TournamentRulesetTemplate
        key={JSON.stringify([requestKey, read.data?.ruleset])}
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
              if (updated) {
                setRulesetOverride({ requestKey, ruleset: updated });
                replaceResilientReadCache(requestKey, { ruleset: updated, settings });
              }
            }) ?? Promise.resolve()
        }
        organizationAlias={organizationAlias}
        overrides={ruleset.overrides}
        settings={settings}
        tournamentAlias={tournamentAlias}
      />
    </ReadState>
  );
}
