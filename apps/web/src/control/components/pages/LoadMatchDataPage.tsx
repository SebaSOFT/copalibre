import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type BulkLoadMatchDataRequest,
  type MatchConsoleApiClient,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { useToast } from '../ToastProvider.js';
import { LoadMatchDataTemplate } from '../screens/LoadMatchDataTemplate.js';
import { Alert } from '../ui/atoms/alert.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * The bulk/structured entry screen: a match's roster, its full event
 * history, and its result, submitted together — for a match played with no
 * live console present. The initial projection and
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

  const read = useResilientRead(
    `control-load-match:${organizationAlias}:${tournamentAlias}:${matchId}`,
    async () => {
      const projection = await api.fetchMatchConsole(organizationAlias, tournamentAlias, matchId);
      const entries = await Promise.all(
        projection.entrants.map(
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
      return { projection, candidatesByEntrant: new Map(entries) };
    },
    { thing: intl.formatMessage(messages.loadMatchDataTitle) },
  );
  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.loadMatchDataTitle)} />;
  const { projection, candidatesByEntrant } = read.data;

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
    <ReadState {...read} title={intl.formatMessage(messages.loadMatchDataTitle)}>
      <LoadMatchDataTemplate
        candidatesByEntrant={candidatesByEntrant}
        matchId={matchId}
        onSubmit={submit}
        projection={projection}
        tournamentAlias={tournamentAlias}
      />
    </ReadState>
  );
}
