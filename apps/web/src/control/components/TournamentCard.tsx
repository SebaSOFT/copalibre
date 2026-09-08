import { useIntl } from 'react-intl';
import type { SemanticColor } from '@copalibre/design-tokens';
import {
  LIFECYCLE_PRESENTATION,
  type TournamentCard as CardModel,
  type TournamentLifecycle,
} from '../lib/dashboard.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { messages } from '../i18n/messages.en.js';
import { Button } from './ui/atoms/button.js';
import { DataEntityCard, type DataEntityCardAccent } from './ui/molecules/data-entity-card.js';
import { DropdownMenu } from './ui/organisms/dropdown-menu.js';

/** The lifecycle's accent and badge tone, as the closed sets each accepts. */
const TONE: Readonly<
  Record<
    TournamentLifecycle,
    { readonly accent: DataEntityCardAccent; readonly badge: SemanticColor }
  >
> = {
  live: { accent: 'live', badge: 'state-live' },
  upcoming: { accent: 'upcoming', badge: 'state-upcoming' },
  draft: { accent: 'muted', badge: 'text-muted' },
  finished: { accent: 'positive', badge: 'state-positive' },
};

/** The exports the dashboard already produces; named so a caller cannot invent one. */
export type TournamentExportKind = 'participants/team' | 'results' | 'standings';

export interface TournamentCardProps {
  readonly card: CardModel;
  readonly organizationAlias: string;
  readonly onExport: (alias: string, kind: TournamentExportKind) => void;
  readonly onExportConfiguration: (alias: string) => void;
  readonly onArchive: (alias: string) => void;
}

/**
 * One tournament on the dashboard.
 *
 * The accent bar is the state's colour and the badge is its word. Both, always
 * — an operator scanning twenty cards in a noisy venue is exactly the person a
 * colour-only cue fails.
 *
 * Its actions live in the card rather than beside it. They used to sit in a
 * `<p>` styled as a flex row in `Dashboard.tsx`, five equal-weight buttons
 * acting on an entity they were merely adjacent to; at 375px that wrapped into
 * four ragged rows per tournament. Here they are ranked: one primary action,
 * the four exports behind one menu, and the destructive one held apart.
 */
export function TournamentCard({
  card,
  organizationAlias,
  onExport,
  onExportConfiguration,
  onArchive,
}: TournamentCardProps): React.JSX.Element {
  const intl = useIntl();
  const presentation = LIFECYCLE_PRESENTATION[card.lifecycle];
  const base = `/control/${organizationAlias}/tournaments/${card.alias}`;

  /*
    `matches-view` is the listing route. `.../matches` is not a route at all —
    `parseControlPath` accepts it only as `matches/{matchId}`, one console — so a
    title linking there would resolve to nothing.
  */
  const matchesHref = `${base}/matches-view`;
  // A draft has nothing to open yet; its own requirement asks for a way back
  // into editing, which is its settings screen.
  const primaryHref = card.lifecycle === 'draft' ? `${base}/settings` : matchesHref;
  const primaryLabel =
    card.lifecycle === 'draft'
      ? intl.formatMessage(messages.dashboardResumeEditing)
      : intl.formatMessage(messages.dashboardOpen);

  const exports = [
    {
      id: 'participants',
      label: messages.dashboardParticipantsCsv,
      run: () => onExport(card.alias, 'participants/team'),
    },
    {
      id: 'results',
      label: messages.dashboardResultsCsv,
      run: () => onExport(card.alias, 'results'),
    },
    {
      id: 'standings',
      label: messages.dashboardStandingsCsv,
      run: () => onExport(card.alias, 'standings'),
    },
    {
      id: 'configuration',
      label: messages.dashboardConfigurationJson,
      run: () => onExportConfiguration(card.alias),
    },
  ];

  return (
    <DataEntityCard
      accent={TONE[card.lifecycle].accent}
      actions={
        <div className="cl-entity-card-actions">
          <a
            className="cl-btn cl-btn--primary cl-focusable"
            href={primaryHref}
            onClick={controlLinkClick(primaryHref)}
          >
            {primaryLabel}
          </a>
          <DropdownMenu
            items={exports.map((one) => ({
              id: one.id,
              label: intl.formatMessage(one.label),
              onSelect: one.run,
            }))}
            trigger={
              <Button type="button" variant="secondary">
                {intl.formatMessage(messages.dashboardExport)}
              </Button>
            }
          />
          {card.lifecycle === 'finished' && (
            <span className="cl-entity-card-actions__destructive">
              <Button
                onClick={() => onArchive(card.alias)}
                type="button"
                variant="destructive-outline"
              >
                {intl.formatMessage(messages.dashboardArchive)}
              </Button>
            </span>
          )}
        </div>
      }
      badge={{
        label: intl.formatMessage(presentation.label),
        state: TONE[card.lifecycle].badge,
        testId: 'lifecycle',
      }}
      metadata={[
        {
          label: intl.formatMessage(messages.dashboardMatchesToday),
          numeric: true,
          value: String(card.matchesToday),
        },
        {
          label: intl.formatMessage(messages.dashboardPendingRegistrations),
          numeric: true,
          value: String(card.pendingRegistrations),
        },
      ]}
      onTitleNavigate={controlLinkClick(matchesHref)}
      title={card.name}
      titleHref={matchesHref}
    />
  );
}
