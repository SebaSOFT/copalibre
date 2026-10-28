import { useIntl } from 'react-intl';
import type { SemanticColor } from '@copalibre/design-tokens';
import {
  LIFECYCLE_PRESENTATION,
  type TournamentCard as CardModel,
  type TournamentLifecycle,
} from '../lib/dashboard.js';
import { controlLinkClick, navigateControl } from '../lib/control-navigation.js';
import { messages } from '../i18n/messages.en.js';
import { Button } from './ui/atoms/button.js';
import { LinkButton } from './ui/atoms/link-button.js';
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
export type TournamentExportKind =
  'participants/individual' | 'participants/team' | 'results' | 'standings';

export interface TournamentSummaryCardProps {
  readonly card: CardModel;
  readonly organizationAlias: string;
  readonly onExport: (
    alias: string,
    kind: TournamentExportKind,
    trigger?: HTMLElement | null,
  ) => void;
  readonly onExportConfiguration: (alias: string) => void;
  readonly onArchive: (alias: string) => void;
  readonly onPublish: (alias: string, name: string) => void;
  /** Gates the Broadcaster Studio link — the same capability its backend endpoints already require. */
  readonly canManageDisplayTokens: boolean;
  readonly canManageTournamentLifecycle: boolean;
}

/**
 * One tournament on the dashboard.
 *
 * The accent bar is the state's colour and the badge is its word. Both, always —
 * an operator scanning twenty cards in a noisy venue is exactly the person a
 * colour-only cue fails.
 *
 * Its actions live in the card rather than beside it. They used to sit in a
 * `<p>` styled as a flex row in `Dashboard.tsx`, five equal-weight buttons
 * acting on an entity they were merely adjacent to; at 375px that wrapped into
 * four ragged rows per tournament. Here they are ranked: one primary action,
 * compact destinations, secondary actions behind one menu, and destructive
 * actions held apart.
 */
export function TournamentSummaryCard({
  card,
  organizationAlias,
  onExport,
  onExportConfiguration,
  onArchive,
  onPublish,
  canManageDisplayTokens,
  canManageTournamentLifecycle,
}: TournamentSummaryCardProps): React.JSX.Element {
  const intl = useIntl();
  const presentation = LIFECYCLE_PRESENTATION[card.lifecycle];
  const base = `/control/${organizationAlias}/tournaments/${card.alias}`;
  const broadcasterHref = `${base}/broadcaster`;

  /*
    `matches-view` is the listing route. `.../matches` is not a route at all —
    `parseControlPath` accepts it only as `matches/{matchId}`, one console — so a
    title linking there would resolve to nothing.
  */
  const matchesHref = `${base}/matches-view`;
  // A draft has nothing to open yet; its own requirement asks for a way back
  // into editing, which is its settings screen.
  const primaryHref = card.lifecycle === 'draft' ? `${base}/settings` : matchesHref;
  // The Tournament hub: a second entry point alongside the
  // title, since it leads somewhere the title never has — the tournament's
  // stage list, not its matches.
  const stagesHref = base;
  const publicHref = `/${organizationAlias}/tournaments/${card.alias}`;
  const tvHref = `/tv/${organizationAlias}/tournaments/${card.alias}`;
  const primaryLabel =
    card.lifecycle === 'draft'
      ? intl.formatMessage(messages.dashboardResumeEditing)
      : intl.formatMessage(messages.dashboardOpen);

  const secondaryActions: {
    readonly id: string;
    readonly label: (typeof messages)[keyof typeof messages];
    readonly run: (trigger?: HTMLElement | null) => void;
  }[] = [
    ...(card.lifecycle === 'draft' && canManageTournamentLifecycle
      ? [
          {
            id: 'publish',
            label: messages.dashboardPublishAction,
            run: () => onPublish(card.alias, card.name),
          },
        ]
      : []),
    {
      id: 'individual-participants',
      label: messages.dashboardIndividualsCsv,
      run: (trigger) => onExport(card.alias, 'participants/individual', trigger),
    },
    {
      id: 'team-participants',
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
    // A destination, not an export, but still a secondary action. Keep it in
    // the overflow menu so additional destinations do not grow the card's
    // main action row. `navigateControl` directly, not
    // `controlLinkClick`: a menu item is a Radix `onSelect`, not an `<a>`
    // click, and carries no `MouseEvent` to read modifier keys from.
    ...(canManageDisplayTokens
      ? [
          {
            id: 'broadcaster',
            label: messages.dashboardBroadcasterStudio,
            run: () => navigateControl(broadcasterHref),
          },
        ]
      : []),
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
          <a
            className="cl-btn cl-btn--secondary cl-focusable"
            href={stagesHref}
            onClick={controlLinkClick(stagesHref)}
          >
            {intl.formatMessage(messages.dashboardStages)}
          </a>
          <LinkButton
            aria-label={intl.formatMessage(messages.tournamentPublicSite)}
            href={publicHref}
            title={intl.formatMessage(messages.tournamentPublicSite)}
            variant="secondary"
          >
            {intl.formatMessage(messages.tournamentPublicSiteShort)}
          </LinkButton>
          <LinkButton
            aria-label={intl.formatMessage(messages.tournamentTvDisplay)}
            href={tvHref}
            title={intl.formatMessage(messages.tournamentTvDisplay)}
            variant="secondary"
          >
            {intl.formatMessage(messages.tournamentTvDisplayShort)}
          </LinkButton>
          <DropdownMenu
            items={secondaryActions.map((one) => ({
              id: one.id,
              label: intl.formatMessage(one.label),
              onSelect: (trigger) => one.run(trigger),
            }))}
            trigger={
              <Button type="button" variant="secondary">
                {intl.formatMessage(messages.dashboardMoreActions)}
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
