import type { TournamentCompletionResponse } from '@copalibre/contracts';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { withSourceDepth } from '../../../lib/matches-view.js';
import { messages } from '../../i18n/messages.en.js';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { matchCardLabelsFromControlIntl } from '../../lib/matches-view-labels.js';
import { controlTokenStore } from '../../session/token-store.js';
import { MatchesViewTemplate } from '../screens/MatchesViewTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

type StateFilter = 'all' | 'live' | 'upcoming' | 'final';

/**
 * The organizer-facing matches view: the same card grid the
 * public site shows, plus the full internal comparator trace on a
 * tiebreak-decided match — reached only by a subject already holding
 * `org.view-internal-standings` for this tournament, enforced server-side;
 * this screen adds no client-side gate of its own. Read-only: no action
 * here mutates match, schedule, or standings state.
 *
 * Stage/group scope is a query parameter on this same route
 * (`?stageNumber=&groupId=`), not a distinct path — matching
 * `control-path-parser.ts`'s documented design and the public matches view's
 * own query-string scoping, so a caller narrows scope with a plain link
 * rather than a dedicated route per stage.
 *
 * Fetches: the state filter lives here rather than
 * in `MatchesViewTemplate`, since selecting one drives a refetch.
 */
export function MatchesViewPage({
  organizationAlias,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const labels = matchCardLabelsFromControlIntl(intl);
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const scope = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const stageParam = params.get('stageNumber');
    const stageNumber = stageParam ? Number(stageParam) : undefined;
    const groupId = params.get('groupId') ?? undefined;
    return {
      ...(stageNumber !== undefined && Number.isFinite(stageNumber) ? { stageNumber } : {}),
      ...(groupId !== undefined ? { groupId } : {}),
    };
  }, []);
  const [state, setState] = useState<StateFilter>('all');
  const matchesKey = `control-matches-view:${organizationAlias}:${tournamentAlias}:${JSON.stringify({ ...scope, state })}`;
  const matchesRead = useResilientRead(
    matchesKey,
    async () => {
      if (!api.fetchMatchesView) throw new Error('Matches view is unavailable');
      const response = await api.fetchMatchesView(organizationAlias, tournamentAlias, {
        ...scope,
        state,
      });
      return withSourceDepth(response.matches);
    },
    { thing: intl.formatMessage(messages.matchesViewControlTitle) },
  );
  const completionKey = `control-tournament-completion:${organizationAlias}:${tournamentAlias}`;
  const completionRead = useResilientRead<TournamentCompletionResponse | undefined>(
    completionKey,
    () => api.fetchCompletion?.(organizationAlias, tournamentAlias) ?? Promise.resolve(undefined),
    { thing: intl.formatMessage(messages.matchesViewControlTitle) },
  );
  const matches = matchesRead.data ?? [];
  return (
    <ReadState {...matchesRead} title={intl.formatMessage(messages.matchesViewControlTitle)}>
      <ReadState {...completionRead} title={intl.formatMessage(messages.matchesViewControlTitle)}>
        <MatchesViewTemplate
          completion={completionRead.data}
          labels={labels}
          matches={matches}
          organizationAlias={organizationAlias}
          onSelectState={setState}
          state={state}
          status="ready"
        />
      </ReadState>
    </ReadState>
  );
}
