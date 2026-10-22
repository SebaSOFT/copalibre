import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ClubTeamResponse,
  type ControlApiClient,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { useToast } from '../ToastProvider.js';
import { ClubPortalRosterTemplate } from '../screens/ClubPortalRosterTemplate.js';
import { Alert } from '../ui/atoms/alert.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * The Club Portal roster-submission wizard: loads the club's
 * own members and teams once, then submits the assembled squad. All fetches
 * and the one mutation live here; the template only renders the resulting
 * data and calls back through `onCreateTeam`/`onSubmit`.
 */
export function ClubPortalRosterPage({
  organizationAlias,
  clubId,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly clubId: string;
  readonly tournamentAlias: string;
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

  const [submitted, setSubmitted] = useState(false);
  const read = useResilientRead(
    `control-club-registration:${organizationAlias}:${clubId}`,
    async () => {
      const [members, teams] = await Promise.all([
        api.listClubMembers?.(organizationAlias, clubId) ?? Promise.resolve([]),
        api.listClubTeams?.(organizationAlias, clubId) ?? Promise.resolve([]),
      ]);
      return { members, teams };
    },
    {
      thing: intl.formatMessage(messages.clubPortalRosterTitle),
      isEmpty: (data) => data.members.length === 0 && data.teams.length === 0,
    },
  );
  const members = read.data?.members ?? [];
  const teams = read.data?.teams ?? [];
  const setTeams = (
    change: (current: readonly ClubTeamResponse[]) => readonly ClubTeamResponse[],
  ): void => read.update((current) => ({ ...current, teams: change(current.teams) }));

  async function createTeam(name: string): Promise<ClubTeamResponse | undefined> {
    if (!api.createClubTeam || name.trim() === '') return undefined;
    try {
      const team = await api.createClubTeam(organizationAlias, clubId, { name: name.trim() });
      setTeams((current) => [...current, team]);
      return team;
    } catch (error) {
      pushError(error);
      return undefined;
    }
  }

  async function submit(
    teamId: string,
    squad: readonly {
      readonly personId: string;
      readonly role: 'player' | 'substitute' | 'coach' | 'staff';
    }[],
  ): Promise<void> {
    if (!api.submitClubRegistration) return;
    try {
      await api.submitClubRegistration(organizationAlias, clubId, tournamentAlias, {
        teamId,
        members: squad,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.clubPortalRosterSubmitted),
      });
      setSubmitted(true);
    } catch (error) {
      pushError(error);
    }
  }

  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.clubPortalRosterTitle)} />;
  if (submitted) {
    return <Alert tone="success">{intl.formatMessage(messages.clubPortalRosterSubmitted)}</Alert>;
  }

  return (
    <ReadState {...read} title={intl.formatMessage(messages.clubPortalRosterTitle)}>
      <ClubPortalRosterTemplate
        api={api}
        members={members}
        onCreateTeam={createTeam}
        onSubmit={submit}
        teams={teams}
      />
    </ReadState>
  );
}
