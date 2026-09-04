import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { TournamentSettingsPage } from './TournamentSettingsPage.js';
import { messages } from '../i18n/messages.en.js';

export function TournamentSettingsRoute({
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
  const [settings, setSettings] = useState<
    Awaited<ReturnType<NonNullable<ControlApiClient['fetchTournamentSettings']>>> | undefined
  >(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .fetchTournamentSettings?.(organizationAlias, tournamentAlias)
      .then((loaded) => {
        if (live) setSettings(loaded);
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
      <p className="cl-inline-alert">
        <FormattedMessage {...messages.settingsLoadFailed} />
      </p>
    );
  }
  if (settings === undefined) {
    return (
      <p className="cl-inline-alert">
        <FormattedMessage {...messages.settingsLoading} />
      </p>
    );
  }

  return (
    <TournamentSettingsPage
      onPreview={(request) =>
        api
          .previewTournamentSettings?.(organizationAlias, tournamentAlias, request)
          .then((result) => result?.fields ?? []) ?? Promise.resolve([])
      }
      onSave={(request) =>
        api
          .updateTournamentSettings?.(organizationAlias, tournamentAlias, request)
          .then((updated) => {
            if (updated) setSettings(updated);
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
              if (fresh) setSettings(fresh);
            }),
          ) ?? Promise.resolve()
      }
      onDeleteEmblem={() =>
        api.deleteTournamentEmblem?.(organizationAlias, tournamentAlias).then(() =>
          api.fetchTournamentSettings?.(organizationAlias, tournamentAlias).then((fresh) => {
            if (fresh) setSettings(fresh);
          }),
        ) ?? Promise.resolve()
      }
      organizationAlias={organizationAlias}
      settings={settings}
      tournamentAlias={tournamentAlias}
    />
  );
}
