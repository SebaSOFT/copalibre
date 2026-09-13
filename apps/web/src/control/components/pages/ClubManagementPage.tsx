import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ClubResponse,
  type ControlApiClient,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import { ClubManagementTemplate } from '../screens/ClubManagementTemplate.js';

/**
 * Club identity management — the first club-related component in the
 * app: list an organization's clubs, create one, edit its name/alias/
 * abbreviation, and upload or replace its emblem through the route
 * previously built with no caller until now.
 *
 * Fetches and mutates (openspec 0225 task 6.2): every call into the API
 * client lives here; `ClubManagementTemplate` composes the club list, the
 * new-club form, and the edit/emblem-upload panel from the resulting data
 * and the callbacks below.
 */
export function ClubManagementPage({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const { push, pushError } = useToast();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );

  const [clubs, setClubs] = useState<readonly ClubResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  const reload = useCallback(async (): Promise<void> => {
    try {
      const loaded = await (api.listClubs?.(organizationAlias) ?? Promise.resolve([]));
      setClubs(loaded);
      setLoadError(undefined);
    } catch {
      setLoadError(intl.formatMessage(messages.clubManagementLoadFailed));
    }
  }, [api, intl, organizationAlias]);

  useEffect(() => {
    let live = true;
    (api.listClubs?.(organizationAlias) ?? Promise.resolve([]))
      .then((loaded) => {
        if (live) {
          setClubs(loaded);
          setLoadError(undefined);
        }
      })
      .catch(() => {
        if (live) setLoadError(intl.formatMessage(messages.clubManagementLoadFailed));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, intl, organizationAlias]);

  async function createClub(name: string, alias: string, abbreviation: string): Promise<boolean> {
    if (!api.createClub || name.trim() === '') return false;
    try {
      await api.createClub(organizationAlias, {
        name: name.trim(),
        ...(alias.trim() === '' ? {} : { alias: alias.trim() }),
        ...(abbreviation.trim() === '' ? {} : { abbreviation: abbreviation.trim() }),
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.clubManagementCreated),
      });
      void reload();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  async function saveClub(
    clubId: string,
    name: string,
    alias: string,
    abbreviation: string,
  ): Promise<void> {
    if (!api.updateClub) return;
    try {
      const updated = await api.updateClub(organizationAlias, clubId, {
        name: name.trim(),
        alias: alias.trim(),
        ...(abbreviation.trim() === '' ? {} : { abbreviation: abbreviation.trim() }),
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.clubManagementSaved),
      });
      setClubs((current) =>
        current.map((club) => (club.clubId === updated.clubId ? updated : club)),
      );
    } catch (error) {
      pushError(error);
    }
  }

  async function uploadClubEmblem(
    clubId: string,
    output: { contentBase64: string; contentType: 'image/png' },
  ): Promise<void> {
    if (!api.uploadClubEmblem) return;
    try {
      await api.uploadClubEmblem(organizationAlias, clubId, {
        filename: 'emblem.png',
        contentType: output.contentType,
        contentBase64: output.contentBase64,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.clubManagementEmblemUploaded),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  if (loading) {
    return <Alert tone="info">{intl.formatMessage(messages.clubManagementLoading)}</Alert>;
  }
  if (loadError) {
    return <Alert tone="destructive">{loadError}</Alert>;
  }

  return (
    <ClubManagementTemplate
      api={api}
      clubs={clubs}
      onCreateClub={createClub}
      onSaveClub={saveClub}
      onUploadClubEmblem={uploadClubEmblem}
      organizationAlias={organizationAlias}
    />
  );
}
