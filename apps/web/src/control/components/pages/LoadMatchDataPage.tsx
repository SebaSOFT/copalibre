import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type BulkLoadMatchDataRequest,
  type MatchConsoleApiClient,
  type MatchConsoleResponse,
  type RosterCandidate,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import { LoadMatchDataTemplate } from '../screens/LoadMatchDataTemplate.js';

type LoadStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly message: string };

/**
 * The bulk/structured entry screen: a match's roster, its full event
 * history, and its result, submitted together — for a match played with no
 * live console present (openspec 0225 task 6.1). The initial projection and
 * roster-candidate load, and the final bulk-load submit, live here;
 * `LoadMatchDataTemplate` owns the roster/segment/event form state and
 * builds the submit request from it. Client-side only until "Submit match
 * data" is pressed; nothing here calls `setMatchRoster`/`recordMatchEvent`/
 * `finalizeMatch` directly, unlike `MatchConsolePage`'s live path.
 */
export function LoadMatchDataPage({
  organizationAlias,
  tournamentAlias,
  matchId,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly matchId: string;
  readonly client?: MatchConsoleApiClient;
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

  const [projection, setProjection] = useState<MatchConsoleResponse>();
  const [status, setStatus] = useState<LoadStatus>({ kind: 'loading' });
  const [candidatesByEntrant, setCandidatesByEntrant] = useState<
    Map<string, readonly RosterCandidate[]>
  >(new Map());

  useEffect(() => {
    let live = true;
    api
      .fetchMatchConsole(organizationAlias, tournamentAlias, matchId)
      .then(async (loaded) => {
        if (!live) return;
        setProjection(loaded);
        const entries = await Promise.all(
          loaded.entrants.map(
            async ({ entrantId }) =>
              [
                entrantId,
                await api.fetchRosterCandidates(
                  organizationAlias,
                  tournamentAlias,
                  matchId,
                  entrantId,
                ),
              ] as const,
          ),
        );
        if (!live) return;
        setCandidatesByEntrant(new Map(entries));
        setStatus({ kind: 'ready' });
      })
      .catch(() =>
        live
          ? setStatus({
              kind: 'error',
              message: intl.formatMessage(messages.loadMatchDataLoadFailed),
            })
          : undefined,
      );
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, matchId, intl]);

  if (status.kind === 'loading' || !projection) {
    return (
      <Alert tone="destructive">
        {status.kind === 'error'
          ? status.message
          : intl.formatMessage(messages.loadMatchDataLoading)}
      </Alert>
    );
  }

  const hasCapability = (capability: (typeof projection.capabilities)[number]): boolean =>
    projection.capabilities.includes(capability);
  const canBulkLoad =
    hasCapability('match.select-roster') &&
    hasCapability('match.record-event') &&
    hasCapability('match.finalize');
  const hasPriorActivity =
    projection.segments.length > 0 || projection.events.length > 0 || projection.result !== null;

  if (!canBulkLoad) {
    return <Alert tone="destructive">{intl.formatMessage(messages.loadMatchDataForbidden)}</Alert>;
  }
  if (hasPriorActivity) {
    return <Alert tone="info">{intl.formatMessage(messages.loadMatchDataNotScheduled)}</Alert>;
  }

  async function submit(request: BulkLoadMatchDataRequest): Promise<boolean> {
    try {
      const response = await api.bulkLoadMatch(
        organizationAlias,
        tournamentAlias,
        matchId,
        request,
      );
      // Entered data is intentionally left in place on success too — an
      // operator reviewing the just-submitted batch is a legitimate need,
      // and there is no live projection here to reload into its place.
      push({
        severity: 'success',
        message: intl.formatMessage(messages.loadMatchDataSubmitSucceeded, {
          eventCount: response.eventCount,
        }),
      });
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  return (
    <LoadMatchDataTemplate
      candidatesByEntrant={candidatesByEntrant}
      matchId={matchId}
      onSubmit={submit}
      projection={projection}
      tournamentAlias={tournamentAlias}
    />
  );
}
