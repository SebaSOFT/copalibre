import { FormattedMessage, useIntl } from 'react-intl';
import { Alert } from '../ui/atoms/alert.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';
import type {
  QualificationPositionResponse,
  QualificationPreviewResponse,
} from '../../lib/api-client.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { sideSourceLabelsFromControlIntl } from '../../lib/matches-view-labels.js';
import { formatQualifier } from '../../../lib/side-source.js';
import { messages } from '../../i18n/messages.en.js';

export type QualificationScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'loaded'; readonly preview: QualificationPreviewResponse };

/**
 * Confirming who qualified into a stage generated ahead.
 *
 * Each qualifier position is listed with the entrant the standings put there, and nothing is
 * written until the organizer confirms. While the prior stage is open, or a cut line is tied,
 * the screen says why and offers no confirm action at all, rather than one the API refuses.
 */
export function QualificationTemplate({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  state,
  busy = false,
  onConfirm,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  readonly state: QualificationScreenState;
  readonly busy?: boolean;
  readonly onConfirm?: () => Promise<void> | void;
}): React.JSX.Element {
  const intl = useIntl();
  const sourceLabels = sideSourceLabelsFromControlIntl(intl);
  const seedingHref = `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/seeding`;
  const preview = state.kind === 'loaded' ? state.preview : undefined;
  const names = preview?.names ?? {};
  const nameOf = (entrantId: string | undefined): string =>
    entrantId === undefined ? sourceLabels.unknown : (names[entrantId] ?? entrantId.slice(0, 8));
  const positionText = (
    entry: Pick<QualificationPositionResponse, 'position' | 'qualifierLabel'>,
  ) => formatQualifier({ kind: 'qualifier', ...entry }, sourceLabels).long;

  const confirmable = preview?.state === 'ready' || preview?.state === 'stale';
  const showConfirmed = preview?.state === 'stale';
  const columns: DataTableColumn<QualificationPositionResponse>[] = [
    {
      key: 'position',
      header: intl.formatMessage(messages.qualificationPositionColumn),
      render: (row) => positionText(row),
    },
    ...(preview?.positions.some((row) => row.zoneName !== undefined)
      ? [
          {
            key: 'zone',
            header: intl.formatMessage(messages.qualificationZoneColumn),
            render: (row: QualificationPositionResponse) => row.zoneName ?? '',
          },
        ]
      : []),
    {
      key: 'entrant',
      header: intl.formatMessage(messages.qualificationEntrantColumn),
      render: (row) => (
        <span data-qualification-entrant={row.position}>{nameOf(row.entrantId)}</span>
      ),
    },
    ...(showConfirmed
      ? [
          {
            key: 'confirmed',
            header: intl.formatMessage(messages.qualificationConfirmedColumn),
            render: (row: QualificationPositionResponse) => nameOf(row.confirmedEntrantId),
          },
        ]
      : []),
  ];

  const statusNode = (() => {
    if (state.kind === 'loading')
      return <Alert tone="info">{intl.formatMessage(messages.qualificationLoading)}</Alert>;
    if (state.kind === 'failed')
      return (
        <Alert tone="destructive">{intl.formatMessage(messages.qualificationLoadFailed)}</Alert>
      );
    if (state.kind === 'empty')
      return <Alert tone="info">{intl.formatMessage(messages.qualificationEmpty)}</Alert>;
    const loaded = state.preview;
    if (loaded.state === 'incomplete')
      return (
        <Alert tone="info">
          {loaded.incomplete.length === 0
            ? intl.formatMessage(messages.qualificationNotStarted)
            : intl.formatMessage(messages.qualificationIncomplete, {
                count: loaded.incomplete.length,
              })}
        </Alert>
      );
    if (loaded.state === 'tied' && loaded.tie !== undefined) {
      const tie = loaded.tie;
      const positions = loaded.positions.filter(
        (entry) =>
          entry.promotionPlanId === tie.promotionPlanId && tie.positions.includes(entry.position),
      );
      return (
        <Alert tone="warning">
          {intl.formatMessage(messages.qualificationTie, {
            entrants: intl.formatList(tie.entrantIds.map(nameOf), { type: 'conjunction' }),
            group: tie.groupName ?? 'none',
            positions: intl.formatList(positions.map(positionText), { type: 'disjunction' }),
          })}
        </Alert>
      );
    }
    if (loaded.state === 'stale')
      return <Alert tone="warning">{intl.formatMessage(messages.qualificationStale)}</Alert>;
    if (loaded.state === 'confirmed')
      return <Alert tone="success">{intl.formatMessage(messages.qualificationConfirmed)}</Alert>;
    return <Alert tone="info">{intl.formatMessage(messages.qualificationReady)}</Alert>;
  })();

  const listingNode = (
    <div className="cl-screen-sections">
      {statusNode}
      {preview !== undefined && preview.positions.length > 0 && (
        <Card className="cl-chamfer cl-chamfer--control">
          <div className="cl-card__content">
            <DataTable
              ariaLabel={intl.formatMessage(messages.qualificationTitle)}
              columns={columns}
              rowKey={(row) => `${row.promotionPlanId}:${row.position}`}
              rows={preview.positions}
            />
          </div>
        </Card>
      )}
      <div>
        <a className="cl-focusable" href={seedingHref} onClick={controlLinkClick(seedingHref)}>
          <FormattedMessage {...messages.qualificationSeedingLink} />
        </a>
      </div>
    </div>
  );

  return (
    <ListScreenLayout
      breadcrumb={
        <span>
          {organizationAlias} &gt; {tournamentAlias}
        </span>
      }
      listing={listingNode}
      title={<FormattedMessage {...messages.qualificationTitle} />}
      toolbar={
        confirmable ? (
          <Button disabled={busy} onClick={() => void onConfirm?.()} type="button">
            {intl.formatMessage(
              preview?.state === 'stale'
                ? messages.qualificationReconfirm
                : messages.qualificationConfirm,
            )}
          </Button>
        ) : undefined
      }
    />
  );
}
