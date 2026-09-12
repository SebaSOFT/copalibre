import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import type { MatchCardData } from '../../../lib/matches-view.js';
import { matchCardLabelsFromControlIntl } from '../../lib/matches-view-labels.js';
import { MatchesViewTemplate } from '../screens/MatchesViewTemplate.js';

type StateFilter = 'all' | 'live' | 'upcoming' | 'final';

/**
 * The organizer-facing matches view (openspec 0172): the same card grid the
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
 * Fetches (openspec 0225 task 6.2): the state filter lives here rather than
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
  const [matches, setMatches] = useState<readonly MatchCardData[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    api
      .fetchMatchesView?.(organizationAlias, tournamentAlias, { ...scope, state })
      .then((response) => {
        if (!live) return;
        setMatches(response.matches);
        setStatus('ready');
      })
      .catch(() => {
        if (live) setStatus('error');
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, scope, state]);

  return (
    <MatchesViewTemplate
      labels={labels}
      matches={matches}
      onSelectState={setState}
      state={state}
      status={status}
    />
  );
}
