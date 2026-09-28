import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { Alert } from '../ui/atoms/alert.js';
import {
  createControlApiClient,
  type ClubMemberResponse,
  type ClubTeamResponse,
  type ControlApiClient,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import { ClubPortalRosterTemplate } from '../screens/ClubPortalRosterTemplate.js';

/**
 * The Club Portal roster-submission wizard (openspec 0301): loads the club's
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

  const [members, setMembers] = useState<readonly ClubMemberResponse[]>([]);
  const [teams, setTeams] = useState<readonly ClubTeamResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      api.listClubMembers?.(organizationAlias, clubId) ?? Promise.resolve([]),
      api.listClubTeams?.(organizationAlias, clubId) ?? Promise.resolve([]),
    ])
      .then(([loadedMembers, loadedTeams]) => {
        if (!live) return;
        setMembers(loadedMembers);
        setTeams(loadedTeams);
        setLoadError(undefined);
      })
      .catch(() => {
        if (live) setLoadError(intl.formatMessage(messages.clubPortalRosterLoadFailed));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, intl, organizationAlias, clubId]);

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

  if (loading) {
    return <Alert tone="info">{intl.formatMessage(messages.clubPortalRosterLoading)}</Alert>;
  }
  if (loadError) {
    return <Alert tone="destructive">{loadError}</Alert>;
  }
  if (submitted) {
    return <Alert tone="success">{intl.formatMessage(messages.clubPortalRosterSubmitted)}</Alert>;
  }

  return (
    <ClubPortalRosterTemplate
      api={api}
      members={members}
      onCreateTeam={createTeam}
      onSubmit={submit}
      teams={teams}
    />
  );
}
