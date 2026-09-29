import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { Alert } from '../ui/atoms/alert.js';
import {
  createControlApiClient,
  type ClubMemberResponse,
  type ControlApiClient,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import { ClubPortalMembersTemplate } from '../screens/ClubPortalMembersTemplate.js';

/**
 * The Club Portal member directory (openspec 0301): a club-admin's own scoped
 * person registry. Fetches and mutates, the same split `ClubManagementPage`
 * already establishes — every API call lives here, `ClubPortalMembersTemplate`
 * only renders the resulting data and calls back through the `on*` props.
 */
export function ClubPortalMembersPage({
  organizationAlias,
  clubId,
  client,
}: {
  readonly organizationAlias: string;
  readonly clubId: string;
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

  const [members, setMembers] = useState<readonly ClubMemberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  const reload = useCallback(async (): Promise<void> => {
    try {
      const loaded = await (api.listClubMembers?.(organizationAlias, clubId) ??
        Promise.resolve([]));
      setMembers(loaded);
      setLoadError(undefined);
    } catch {
      setLoadError(intl.formatMessage(messages.clubPortalMembersLoadFailed));
    }
  }, [api, intl, organizationAlias, clubId]);

  useEffect(() => {
    let live = true;
    (api.listClubMembers?.(organizationAlias, clubId) ?? Promise.resolve([]))
      .then((loaded) => {
        if (live) {
          setMembers(loaded);
          setLoadError(undefined);
        }
      })
      .catch(() => {
        if (live) setLoadError(intl.formatMessage(messages.clubPortalMembersLoadFailed));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, intl, organizationAlias, clubId]);

  async function createMember(
    displayName: string,
    alias: string,
    birthDate: string,
  ): Promise<boolean> {
    if (!api.createClubMember || displayName.trim() === '') return false;
    try {
      await api.createClubMember(organizationAlias, clubId, {
        displayName: displayName.trim(),
        ...(alias.trim() === '' ? {} : { alias: alias.trim() }),
        ...(birthDate.trim() === '' ? {} : { birthDate: birthDate.trim() }),
      });
      push({ severity: 'success', message: intl.formatMessage(messages.clubPortalMembersCreated) });
      void reload();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  async function saveMember(personId: string, displayName: string, alias: string): Promise<void> {
    if (!api.updateClubMember) return;
    try {
      const updated = await api.updateClubMember(organizationAlias, clubId, personId, {
        displayName: displayName.trim(),
        alias: alias.trim(),
      });
      push({ severity: 'success', message: intl.formatMessage(messages.clubPortalMembersSaved) });
      setMembers((current) =>
        current.map((member) => (member.personId === updated.personId ? updated : member)),
      );
    } catch (error) {
      pushError(error);
    }
  }

  if (loading) {
    return <Alert tone="info">{intl.formatMessage(messages.clubPortalMembersLoading)}</Alert>;
  }
  if (loadError) {
    return <Alert tone="destructive">{loadError}</Alert>;
  }

  return (
    <ClubPortalMembersTemplate
      api={api}
      members={members}
      onCreateMember={createMember}
      onSaveMember={saveMember}
    />
  );
}
