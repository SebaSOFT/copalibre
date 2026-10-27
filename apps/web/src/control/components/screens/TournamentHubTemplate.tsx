import { FormattedMessage, useIntl } from 'react-intl';
import type { StageResponse } from '../../lib/api-client.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { Badge } from '../ui/atoms/badge.js';
import { Card } from '../ui/atoms/card.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';
import { formatEnum } from '../../lib/presentation-formatting.js';

/**
 * The Tournament hub: the first real Tournament → Stage link
 * control-web has ever had. Purely presentational — `TournamentHubPage` owns
 * the `listStages` fetch — so a stage with no fixtures yet renders exactly
 * like one that already has them, distinguished only by its seeded badge.
 */
export function TournamentHubTemplate({
  organizationAlias,
  tournamentAlias,
  tournamentName,
  stages,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly tournamentName?: string;
  readonly stages: readonly StageResponse[];
}): React.JSX.Element {
  const intl = useIntl();

  const titleNode = tournamentName?.trim() || intl.formatMessage(messages.tournamentHubTitle);

  const listingNode = (
    <Card
      aria-label={intl.formatMessage(messages.tournamentHubStagesHeading)}
      className="cl-chamfer cl-chamfer--control"
    >
      <header className="cl-card__header">
        <h2 className="cl-card__title">
          <FormattedMessage {...messages.tournamentHubStagesHeading} />
        </h2>
      </header>
      <div className="cl-card__content">
        {stages.length === 0 ? (
          <p className="cl-card__description">
            <FormattedMessage {...messages.tournamentHubEmpty} />
          </p>
        ) : (
          <ul>
            {stages.map((stage) => {
              const href = `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stage.number}`;
              return (
                <li key={stage.number} className="cl-role-user">
                  <a
                    aria-label={intl.formatMessage(messages.tournamentHubOpenStage, {
                      number: stage.number,
                      name: stage.name,
                    })}
                    className="cl-focusable"
                    href={href}
                    onClick={controlLinkClick(href)}
                  >
                    <strong>{stage.number}.</strong> {stage.name} (
                    {formatEnum(intl, 'format', stage.format)})
                  </a>
                  <Badge
                    label={intl.formatMessage(
                      stage.seeded ? messages.tournamentHubSeeded : messages.tournamentHubUnseeded,
                    )}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );

  return <ListScreenLayout listing={listingNode} title={titleNode} />;
}
