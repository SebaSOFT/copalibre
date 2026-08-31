import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { MatchCard } from '../../components/MatchCard.js';
import type { MatchCardData } from '../../lib/matches-view.js';
import { matchCardLabelsFromControlIntl } from '../lib/matches-view-labels.js';
import { messages } from '../i18n/messages.en.js';

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
 */
export function MatchesViewRoute({
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
    <section className="cl-list-screen">
      <div className="cl-list-screen__header">
        <h1 className="cl-list-screen__title">
          {intl.formatMessage(messages.matchesViewControlTitle)}
        </h1>
        <div role="group" aria-label={intl.formatMessage(messages.matchesViewControlTitle)}>
          {(['all', 'live', 'upcoming', 'final'] as const).map((option) => (
            <button
              key={option}
              className="cl-btn cl-btn--secondary"
              type="button"
              aria-pressed={state === option}
              onClick={() => setState(option)}
            >
              {labels.filters[option]}
            </button>
          ))}
        </div>
      </div>

      {status === 'error' && <p>{intl.formatMessage(messages.matchesViewControlLoadFailed)}</p>}
      {status === 'ready' && matches.length === 0 && (
        <p className="cl-list-screen__empty">{labels.empty}</p>
      )}
      {matches.length > 0 && (
        <div className="cl-matches-view__grid">
          {matches.map((match) => (
            <MatchCard key={match.matchId} match={match} labels={labels} />
          ))}
        </div>
      )}
    </section>
  );
}
