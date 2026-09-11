import { useIntl } from 'react-intl';
import { MatchCard } from '../../../components/ui/organisms/MatchCard.js';
import type { MatchCardData } from '../../../lib/matches-view.js';
import type { matchCardLabelsFromControlIntl } from '../../lib/matches-view-labels.js';
import { Button } from '../ui/atoms/button.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

type StateFilter = 'all' | 'live' | 'upcoming' | 'final';

/**
 * Composes the screen from the data `MatchesViewPage` supplies (openspec
 * 0225 task 6.2): purely presentational — which filter is active lives in
 * the page instead, since selecting one drives a refetch.
 */
export function MatchesViewTemplate({
  labels,
  matches,
  onSelectState,
  state,
  status,
}: {
  readonly labels: ReturnType<typeof matchCardLabelsFromControlIntl>;
  readonly matches: readonly MatchCardData[];
  readonly onSelectState: (state: StateFilter) => void;
  readonly state: StateFilter;
  readonly status: 'loading' | 'ready' | 'error';
}): React.JSX.Element {
  const intl = useIntl();

  const toolbarNode = (
    <div role="group" aria-label={intl.formatMessage(messages.matchesViewControlTitle)}>
      {(['all', 'live', 'upcoming', 'final'] as const).map((option) => (
        <Button
          aria-pressed={state === option}
          key={option}
          onClick={() => onSelectState(option)}
          type="button"
          variant="secondary"
        >
          {labels.filters[option]}
        </Button>
      ))}
    </div>
  );

  const listingNode = (
    <>
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
    </>
  );

  return (
    <ListScreenLayout
      listing={listingNode}
      title={intl.formatMessage(messages.matchesViewControlTitle)}
      toolbar={toolbarNode}
    />
  );
}
