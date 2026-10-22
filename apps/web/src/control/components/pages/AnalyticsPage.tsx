import type { TournamentCompletionResponse } from '@copalibre/contracts';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { AnalyticsTemplate } from '../screens/AnalyticsTemplate.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * Fetches: the tournament and storage-usage loads
 * live here; `AnalyticsTemplate` composes the screen from the resulting
 * data.
 */
export function AnalyticsPage({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
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

  const read = useResilientRead(
    `control-analytics:${organizationAlias}`,
    async () => {
      const listTournaments = api.listActiveTournaments;
      const getStorage = api.getStorageUsage;
      const [tournaments, storage] = await Promise.all([
        listTournaments ? listTournaments(organizationAlias) : Promise.resolve([]),
        getStorage ? getStorage(organizationAlias) : Promise.resolve(undefined),
      ]);
      return { tournaments, storage };
    },
    {
      thing: intl.formatMessage(messages.analyticsSubtitle),
      isEmpty: ({ tournaments }) => tournaments.length === 0,
    },
  );

  const data = read.data;
  const [completions, setCompletions] = useState<
    Readonly<Record<string, { data?: TournamentCompletionResponse; staleSince?: number }>>
  >({});
  const recordCompletion = useCallback(
    (
      key: string,
      data: TournamentCompletionResponse | undefined,
      staleSince: number | undefined,
    ) => {
      setCompletions((current) => ({ ...current, [key]: { data, staleSince } }));
    },
    [],
  );
  const completionByTournament = Object.fromEntries(
    (data?.tournaments ?? []).map((tournament) => [
      tournament.alias,
      completions[`${organizationAlias}:${tournament.alias}`]?.data,
    ]),
  );
  const completionStaleSince = (data?.tournaments ?? [])
    .map((tournament) => completions[`${organizationAlias}:${tournament.alias}`]?.staleSince)
    .find((age) => age !== undefined);

  return (
    <>
      <AnalyticsTemplate
        completionByTournament={completionByTournament}
        failed={read.status === 'failed-empty'}
        loading={read.status === 'loading'}
        onRetry={read.retry}
        organizationAlias={organizationAlias}
        staleSince={read.status === 'stale' ? read.staleSince : completionStaleSince}
        storage={data?.storage}
        tournaments={data?.tournaments ?? []}
      />
      {(data?.tournaments ?? []).map((tournament) => (
        <CompletionReader
          key={`${organizationAlias}:${tournament.alias}`}
          organizationAlias={organizationAlias}
          tournamentAlias={tournament.alias}
          client={api}
          onRead={recordCompletion}
        />
      ))}
    </>
  );
}

/** Each completion read retries independently, keeping other tournament rows visible. */
function CompletionReader({
  organizationAlias,
  tournamentAlias,
  client,
  onRead,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client: ControlApiClient;
  readonly onRead: (
    key: string,
    data: TournamentCompletionResponse | undefined,
    staleSince: number | undefined,
  ) => void;
}): null {
  const intl = useIntl();
  const read = useResilientRead(
    `control-completion:${organizationAlias}:${tournamentAlias}`,
    () =>
      client.fetchCompletion?.(organizationAlias, tournamentAlias) ?? Promise.resolve(undefined),
    {
      thing: intl.formatMessage(messages.analyticsSubtitle),
      enabled: client.fetchCompletion !== undefined,
    },
  );
  useEffect(() => {
    onRead(
      `${organizationAlias}:${tournamentAlias}`,
      read.data,
      read.status === 'failed-empty' ? Date.now() : read.staleSince,
    );
  }, [organizationAlias, tournamentAlias, read.data, read.status, read.staleSince, onRead]);
  return null;
}
