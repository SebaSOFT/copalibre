import { capabilitiesForRole } from '@copalibre/domain';
import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  ControlApiError,
  createControlApiClient,
  type ClubResponse,
  type ControlApiClient,
} from '../../lib/api-client.js';
import { useToast } from '../ToastProvider.js';
import { isValidClubAlias } from '../../../lib/club-url.js';
import { ClubManagementTemplate, type ClubSaveOutcome } from '../screens/ClubManagementTemplate.js';
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

  /**
   * A 409 `club-conflict` on a well-formed alias means another club holds it (a stale list did not show it).
   * It goes back to the form's alias field; every other failure is reported as a toast.
   */
  function reportSaveError(error: unknown, alias: string): ClubSaveOutcome {
    if (
      error instanceof ControlApiError &&
      error.status === 409 &&
      error.errorCode === 'club-conflict' &&
      isValidClubAlias(alias.trim())
    ) {
      return 'alias-taken';
    }
    pushError(error);
    return 'failed';
  }

  async function createClub(
    name: string,
    alias: string,
    abbreviation: string,
  ): Promise<ClubSaveOutcome> {
    if (!api.createClub || name.trim() === '') return 'failed';
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
      return 'saved';
    } catch (error) {
      return reportSaveError(error, alias);
    }
  }

  async function saveClub(
    clubId: string,
    name: string,
    alias: string,
    abbreviation: string,
  ): Promise<ClubSaveOutcome> {
    if (!api.updateClub) return 'failed';
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
      return 'saved';
    } catch (error) {
      return reportSaveError(error, alias);
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
