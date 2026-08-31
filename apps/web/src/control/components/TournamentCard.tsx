import { FormattedMessage, useIntl } from 'react-intl';
import { LIFECYCLE_PRESENTATION, type TournamentCard as CardModel } from '../lib/dashboard.js';
import { messages } from '../i18n/messages.en.js';

/**
 * One tournament on the dashboard.
 *
 * The accent bar is the state's colour and the badge is its word. Both, always
 * — an operator scanning twenty cards in a noisy venue is exactly the person a
 * colour-only cue fails.
 */
export function TournamentCard({ card }: { readonly card: CardModel }): React.JSX.Element {
  const intl = useIntl();
  const presentation = LIFECYCLE_PRESENTATION[card.lifecycle];

  return (
    <article className={`cl-card cl-chamfer cl-chamfer--control ${presentation.accent}`}>
      <span className="cl-badge" data-testid="lifecycle">
        {intl.formatMessage(presentation.label)}
      </span>
      <h3>{card.name}</h3>
      <dl>
        <dt>
          <FormattedMessage {...messages.dashboardMatchesToday} />
        </dt>
        <dd className="cl-stat-tile__value">{card.matchesToday}</dd>
        <dt>
          <FormattedMessage {...messages.dashboardPendingRegistrations} />
        </dt>
        <dd className="cl-stat-tile__value">{card.pendingRegistrations}</dd>
      </dl>
    </article>
  );
}
