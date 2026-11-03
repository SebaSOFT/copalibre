import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { type PromotionPreviewResponse, type ZoneResponse } from '../../lib/api-client.js';
import { Button } from '../ui/atoms/button.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';
import { UnsavedChangesBar } from '../ui/organisms/unsaved-changes-bar.js';
import type { QualifiedEntrantResponse } from '../../lib/api-client.js';
import { Input } from '../ui/atoms/input.js';
import { Field } from '../ui/molecules/field.js';
import { messages } from '../../i18n/messages.en.js';
import { PageHeaderTemplate } from './PageHeaderTemplate.js';

export interface BandRow {
  readonly key: string;
  readonly zoneRef: string;
  readonly count: string;
}

/** Informational empty states render as copy; genuine failures use the destructive alert tone. */
export interface PreviewError {
  readonly message: string;
  readonly tone: 'info' | 'destructive';
}

let bandKeySequence = 0;
function nextKey(): string {
  bandKeySequence += 1;
  return `band-${bandKeySequence}`;
}

function initialFormState(zone: ZoneResponse | undefined): {
  readonly nextStageNumber: string;
  readonly perGroupAdvance: string;
  readonly bands: readonly BandRow[];
} {
  const zoneWithPlan = zone as
    | (ZoneResponse & {
        promotionPlan?: {
          nextStageNumber: number;
          rules: {
            perGroupAdvance?: number;
            bands?: readonly { zoneRef: string; count: number }[];
          };
        };
      })
    | undefined;
  if (!zoneWithPlan?.promotionPlan) {
    return { nextStageNumber: '2', perGroupAdvance: '1', bands: [] };
  }
  return {
    nextStageNumber: String(zoneWithPlan.promotionPlan.nextStageNumber),
    perGroupAdvance:
      zoneWithPlan.promotionPlan.rules.perGroupAdvance !== undefined
        ? String(zoneWithPlan.promotionPlan.rules.perGroupAdvance)
        : '1',
    bands:
      zoneWithPlan.promotionPlan.rules.bands?.map((band) => ({
        key: nextKey(),
        zoneRef: band.zoneRef,
        count: String(band.count),
      })) ?? [],
  };
}

function bandsDiffer(current: readonly BandRow[], initial: readonly BandRow[]): boolean {
  if (current.length !== initial.length) return true;
  return current.some(
    (row, index) => row.zoneRef !== initial[index]?.zoneRef || row.count !== initial[index]?.count,
  );
}

function BandCards({
  bands,
  onAdd,
  onRemove,
  onUpdate,
}: {
  readonly bands: readonly BandRow[];
  readonly onAdd: () => void;
  readonly onRemove: (key: string) => void;
  readonly onUpdate: (key: string, patch: Partial<BandRow>) => void;
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <ul className="cl-zone-group__cards">
      {bands.map((row) => (
        <li className="cl-zone-group__card cl-chamfer cl-chamfer--control" key={row.key}>
          <Input
            aria-label={intl.formatMessage(messages.promotionBandZoneRef)}
            onChange={(event) => onUpdate(row.key, { zoneRef: event.target.value })}
            placeholder={intl.formatMessage(messages.promotionBandZoneRef)}
            value={row.zoneRef}
          />
          <Input
            aria-label={intl.formatMessage(messages.promotionBandCount)}
            min="1"
            onChange={(event) => onUpdate(row.key, { count: event.target.value })}
            type="number"
            value={row.count}
          />
          <div className="cl-zone-group__card-foot">
            <Button onClick={() => onRemove(row.key)} type="button" variant="secondary">
              <FormattedMessage {...messages.promotionRemoveBand} />
            </Button>
          </div>
        </li>
      ))}
      <li className="cl-zone-group__card cl-zone-group__card--add">
        <Button onClick={onAdd} type="button" variant="secondary">
          <FormattedMessage {...messages.promotionAddBand} />
        </Button>
      </li>
    </ul>
  );
}

/** The projected candidate order, with the band each candidate lands in when the plan declares bands. */
function CandidateTable({
  entrantLabel,
  preview,
}: {
  readonly entrantLabel: (entrantId: string) => string;
  readonly preview: PromotionPreviewResponse;
}): React.JSX.Element {
  const intl = useIntl();
  const bandOf = new Map<string, string>();
  for (const [bandRef, entrants] of Object.entries(preview.bands ?? {})) {
    for (const entrant of entrants) bandOf.set(entrant.entrantId, bandRef);
  }
  type Row = { entrant: QualifiedEntrantResponse; position: number };
  const columns: DataTableColumn<Row>[] = [
    {
      key: 'position',
      header: intl.formatMessage(messages.promotionColumnPosition),
      render: ({ position }) => position,
    },
    {
      key: 'entrant',
      header: intl.formatMessage(messages.promotionColumnEntrant),
      render: ({ entrant }) => entrantLabel(entrant.entrantId),
    },
    {
      key: 'rank',
      header: intl.formatMessage(messages.promotionColumnGroupRank),
      render: ({ entrant }) => entrant.rank,
    },
  ];
  if (bandOf.size > 0) {
    columns.push({
      key: 'band',
      header: intl.formatMessage(messages.promotionColumnBand),
      render: ({ entrant }) => bandOf.get(entrant.entrantId) ?? '—',
    });
  }
  return (
    <DataTable
      ariaLabel={intl.formatMessage(messages.promotionReviewHeading)}
      columns={columns}
      rowKey={({ entrant }) => entrant.entrantId}
      rows={preview.combined.map((entrant, index) => ({ entrant, position: index + 1 }))}
    />
  );
}

/**
 * Composes the screen from the data `PromotionPlanPage` supplies: the plan-configuration form and band rows below are this
 * component's own screen state, seeded once from the zone's existing plan;
 * `onSave` is the only call back to the page.
 */
export function PromotionPlanTemplate({
  entrantLabel,
  onSave,
  preview,
  previewError,
  tournamentAlias,
  zone,
  zoneNumber,
}: {
  readonly entrantLabel: (entrantId: string) => string;
  readonly onSave: (
    nextStageNumber: string,
    perGroupAdvance: string,
    bands: readonly BandRow[],
  ) => Promise<void>;
  readonly preview: PromotionPreviewResponse | undefined;
  readonly previewError: PreviewError | undefined;
  readonly tournamentAlias: string;
  readonly zone: ZoneResponse | undefined;
  readonly zoneNumber: number;
}): React.JSX.Element {
  const intl = useIntl();
  const [initial] = useState(() => initialFormState(zone));
  const [nextStageNumber, setNextStageNumber] = useState(initial.nextStageNumber);
  const [perGroupAdvance, setPerGroupAdvance] = useState(initial.perGroupAdvance);
  const [bands, setBands] = useState<readonly BandRow[]>(initial.bands);

  const addBand = (): void => {
    setBands((current) => [...current, { key: nextKey(), zoneRef: '', count: '1' }]);
  };

  const updateBand = (key: string, patch: Partial<BandRow>): void => {
    setBands((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeBand = (key: string): void => {
    setBands((current) => current.filter((row) => row.key !== key));
  };

  async function savePlan(): Promise<void> {
    await onSave(nextStageNumber, perGroupAdvance, bands);
  }

  const hasPlan = zone !== undefined && 'promotionPlan' in zone && zone.promotionPlan !== undefined;
  const nextChanged = !hasPlan || nextStageNumber !== initial.nextStageNumber;
  const advanceChanged = !hasPlan || perGroupAdvance !== initial.perGroupAdvance;
  const bandsChanged = bandsDiffer(bands, initial.bands);
  const dirty = nextChanged || advanceChanged || bandsChanged;
  const changedFields = [
    nextChanged && { id: 'next', label: intl.formatMessage(messages.promotionNextStageNumber) },
    advanceChanged && {
      id: 'advance',
      label: intl.formatMessage(messages.promotionPerGroupAdvance),
    },
    bandsChanged && { id: 'bands', label: intl.formatMessage(messages.promotionBandsHeading) },
  ].filter((field): field is { id: string; label: string } => field !== false);
  const slotTotal = bands.reduce((sum, row) => sum + (Number.parseInt(row.count, 10) || 0), 0);

  const breadcrumbNode = (
    <span>
      {intl.formatMessage(messages.promotionBreadcrumb, {
        tournamentAlias,
        zoneName: zone?.name ?? zoneNumber,
      })}
    </span>
  );

  return (
    <PageHeaderTemplate
      legacyBreadcrumb={breadcrumbNode}
      title={<FormattedMessage {...messages.promotionTitle} />}
    >
      <div className="cl-screen-sections cl-promotion">
        <section aria-label={intl.formatMessage(messages.promotionConfigHeading)}>
          <h2 className="cl-promotion__heading">
            <FormattedMessage {...messages.promotionConfigHeading} />
          </h2>
          <div className="cl-promotion__parameters">
            <Field
              id="promotion-next-stage"
              label={intl.formatMessage(messages.promotionNextStageNumber)}
            >
              <Input
                aria-label={intl.formatMessage(messages.promotionNextStageNumber)}
                id="promotion-next-stage"
                min="1"
                onChange={(event) => setNextStageNumber(event.target.value)}
                type="number"
                value={nextStageNumber}
              />
            </Field>
            <Field
              id="promotion-per-group-advance"
              label={intl.formatMessage(messages.promotionPerGroupAdvance)}
            >
              <Input
                aria-label={intl.formatMessage(messages.promotionPerGroupAdvance)}
                id="promotion-per-group-advance"
                min="1"
                onChange={(event) => setPerGroupAdvance(event.target.value)}
                type="number"
                value={perGroupAdvance}
              />
            </Field>
            {bands.length > 0 && (
              <p className="cl-promotion__total">
                <span className="cl-promotion__total-figure">{slotTotal}</span>
                <span>{intl.formatMessage(messages.promotionSlotTotal)}</span>
              </p>
            )}
          </div>
        </section>

        <section aria-label={intl.formatMessage(messages.promotionBandsHeading)}>
          <h2 className="cl-promotion__heading">
            <FormattedMessage {...messages.promotionBandsHeading} />
          </h2>
          <BandCards bands={bands} onAdd={addBand} onRemove={removeBand} onUpdate={updateBand} />
        </section>

        <section aria-label={intl.formatMessage(messages.promotionReviewHeading)}>
          <h2 className="cl-promotion__heading">
            <FormattedMessage {...messages.promotionReviewHeading} />
          </h2>
          {previewError?.tone === 'info' && (
            <p className="cl-card__description">{previewError.message}</p>
          )}
          {previewError?.tone === 'destructive' && (
            <Alert tone="destructive">{previewError.message}</Alert>
          )}
          {preview && !previewError && (
            <CandidateTable entrantLabel={entrantLabel} preview={preview} />
          )}
        </section>

        <UnsavedChangesBar
          changedFields={changedFields}
          dirty={dirty}
          fieldsLabel={intl.formatMessage(messages.unsavedChangesFields)}
          onReset={() => {
            setNextStageNumber(initial.nextStageNumber);
            setPerGroupAdvance(initial.perGroupAdvance);
            setBands(initial.bands);
          }}
          onSave={() => void savePlan()}
          resetLabel={intl.formatMessage(messages.unsavedChangesReset)}
          saveLabel={intl.formatMessage(messages.promotionSavePlan)}
          summary={intl.formatMessage(messages.unsavedChangesSummary, {
            count: Math.max(changedFields.length, 1),
          })}
        />
      </div>
    </PageHeaderTemplate>
  );
}
