import { capabilitiesForRole } from '@copalibre/domain';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ClubResponse,
  type ControlApiClient,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { useToast } from '../ToastProvider.js';
import { ClubManagementTemplate } from '../screens/ClubManagementTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * Club identity management — the first club-related component in the
 * app: list an organization's clubs, create one, edit its name/alias/
 * abbreviation, and upload or replace its emblem through the route
 * previously built with no caller until now.
 *
 * Fetches and mutates: every call into the API
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

  const rolesRead = useResilientRead(
    `control-club-role:${organizationAlias}`,
    () => api.listMyOrganizations(),
    { thing: intl.formatMessage(messages.clubManagementTitle) },
  );
  const role = rolesRead.data?.find((one) => one.organizationAlias === organizationAlias)?.role;

  // Client-side guard only, same "unknown role sees everything" convention
  // as DashboardPage's own capability guards — the Club
  // Portal's own backend routes stay server-enforced regardless.
  const canManageClubMembers =
    role === undefined || capabilitiesForRole(role).includes('org.manage-club-members');

  const read = useResilientRead<readonly ClubResponse[]>(
    `control-clubs:${organizationAlias}`,
    () => api.listClubs?.(organizationAlias) ?? Promise.resolve([]),
    { thing: intl.formatMessage(messages.clubManagementTitle) },
  );
  const clubs = read.data ?? [];
  const setClubs = read.update;
  const reload = read.retry;

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
      throw error;
    }
  }

  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.clubManagementTitle)} />;

  return (
    <ReadState {...read} title={intl.formatMessage(messages.clubManagementTitle)}>
      <ClubManagementTemplate
        api={api}
        canManageClubMembers={canManageClubMembers}
        clubs={clubs}
        onCreateClub={createClub}
        onSaveClub={saveClub}
        onUploadClubEmblem={uploadClubEmblem}
        organizationAlias={organizationAlias}
      />
    </ReadState>
  );
}
