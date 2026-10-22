import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ClubMemberResponse,
  type ControlApiClient,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { useToast } from '../ToastProvider.js';
import { ClubPortalMembersTemplate } from '../screens/ClubPortalMembersTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * The Club Portal member directory: a club-admin's own scoped
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

  const read = useResilientRead<readonly ClubMemberResponse[]>(
    `control-members:${organizationAlias}:${clubId}`,
    () => api.listClubMembers?.(organizationAlias, clubId) ?? Promise.resolve([]),
    { thing: intl.formatMessage(messages.clubPortalMembersTitle) },
  );
  const members = read.data ?? [];
  const setMembers = read.update;
  const reload = read.retry;

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

  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.clubPortalMembersTitle)} />;

  return (
    <ReadState {...read} title={intl.formatMessage(messages.clubPortalMembersTitle)}>
      <ClubPortalMembersTemplate
        api={api}
        members={members}
        onCreateMember={createMember}
        onSaveMember={saveMember}
      />
    </ReadState>
  );
}
