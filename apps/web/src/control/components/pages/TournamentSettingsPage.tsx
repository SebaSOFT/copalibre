import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type RulesetOverridesResponse,
  type TournamentSettingsResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { TournamentSettingsTemplate } from '../screens/TournamentSettingsTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { replaceResilientReadCache, useResilientRead } from './use-resilient-read.js';

export function TournamentSettingsPage({
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
  const requestKey = `control-tournament-settings:${organizationAlias}:${tournamentAlias}`;
  const read = useResilientRead(
    requestKey,
    async () => {
      if (!api.fetchTournamentSettings) throw new Error('Tournament settings are unavailable');
      const settings = await api.fetchTournamentSettings(organizationAlias, tournamentAlias);
      if (!settings) throw new Error('Tournament settings are unavailable');
      // Additive context for the plain-language summary; its failure does not hide settings.
      const ruleset = await (
        api.fetchRulesetOverrides?.(organizationAlias, tournamentAlias) ??
        Promise.resolve(undefined)
      ).catch(() => undefined);
      return { settings, ruleset };
    },
    {
      thing: intl.formatMessage(messages.settingsTitle),
      onSuccess: () => setSettingsOverride(undefined),
    },
  );
  const [settingsOverride, setSettingsOverride] = useState<
    { readonly requestKey: string; readonly settings: TournamentSettingsResponse } | undefined
  >(undefined);
  const settings =
    settingsOverride?.requestKey === requestKey ? settingsOverride.settings : read.data?.settings;
  const ruleset: RulesetOverridesResponse | undefined = read.data?.ruleset;

  if (settings === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.settingsTitle)} />;
  return (
    <ReadState {...read} title={intl.formatMessage(messages.settingsTitle)}>
      <TournamentSettingsTemplate
        key={JSON.stringify([requestKey, read.data?.settings])}
        onPreview={(request) =>
          api
            .previewTournamentSettings?.(organizationAlias, tournamentAlias, request)
            .then((result) => result?.fields ?? []) ?? Promise.resolve([])
        }
        onSave={(request) =>
          api
            .updateTournamentSettings?.(organizationAlias, tournamentAlias, request)
            .then((updated) => {
              if (updated) {
                const savedSettings = { ...settings, ...updated };
                setSettingsOverride({ requestKey, settings: savedSettings });
                replaceResilientReadCache(requestKey, { settings: savedSettings, ruleset });
              }
            }) ?? Promise.resolve()
        }
        onUploadEmblem={(output) =>
          api
            .uploadTournamentEmblem?.(organizationAlias, tournamentAlias, {
              filename: 'emblem.png',
              contentType: output.contentType,
              contentBase64: output.contentBase64,
            })
            .then(() =>
              api.fetchTournamentSettings?.(organizationAlias, tournamentAlias).then((fresh) => {
                if (fresh) {
                  setSettingsOverride({ requestKey, settings: fresh });
                  replaceResilientReadCache(requestKey, { settings: fresh, ruleset });
                }
              }),
            ) ?? Promise.resolve()
        }
        onDeleteEmblem={() =>
          api.deleteTournamentEmblem?.(organizationAlias, tournamentAlias).then(() =>
            api.fetchTournamentSettings?.(organizationAlias, tournamentAlias).then((fresh) => {
              if (fresh) {
                setSettingsOverride({ requestKey, settings: fresh });
                replaceResilientReadCache(requestKey, { settings: fresh, ruleset });
              }
            }),
          ) ?? Promise.resolve()
        }
        organizationAlias={organizationAlias}
        ruleset={ruleset}
        settings={settings}
        tournamentAlias={tournamentAlias}
      />
    </ReadState>
  );
}
