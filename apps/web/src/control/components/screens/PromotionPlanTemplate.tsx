import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { type PromotionPreviewResponse, type ZoneResponse } from '../../lib/api-client.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Input } from '../ui/atoms/input.js';
import { Field } from '../ui/molecules/field.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

export interface BandRow {
  readonly key: string;
  readonly zoneRef: string;
  readonly count: string;
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

/**
 * Composes the screen from the data `PromotionPlanPage` supplies (openspec
 * 0225 task 6.2): the plan-configuration form and band rows below are this
 * component's own screen state, seeded once from the zone's existing plan;
 * `onSave` is the only call back to the page.
 */
export function PromotionPlanTemplate({
  onSave,
  preview,
  previewError,
  tournamentAlias,
  zone,
  zoneNumber,
}: {
  readonly onSave: (
    nextStageNumber: string,
    perGroupAdvance: string,
    bands: readonly BandRow[],
  ) => Promise<void>;
  readonly preview: PromotionPreviewResponse | undefined;
  readonly previewError: string | undefined;
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

  const breadcrumbNode = (
    <span>
      {intl.formatMessage(messages.promotionBreadcrumb, {
        tournamentAlias,
        zoneName: zone?.name ?? zoneNumber,
      })}
    </span>
  );

  const titleNode = <FormattedMessage {...messages.promotionTitle} />;

  const listingNode = (
    <div className="cl-screen-sections">
      <Card
        aria-label={intl.formatMessage(messages.promotionConfigHeading)}
        className="cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.promotionConfigHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <div className="cl-platform-form-grid">
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
          </div>

          <div>
            <h3 className="cl-label">
              <FormattedMessage {...messages.promotionBandsHeading} />
            </h3>
            <ul>
              {bands.map((row) => (
                <li key={row.key} className="cl-role-user">
                  <Input
                    aria-label={intl.formatMessage(messages.promotionBandZoneRef)}
                    onChange={(event) => updateBand(row.key, { zoneRef: event.target.value })}
                    placeholder={intl.formatMessage(messages.promotionBandZoneRef)}
                    value={row.zoneRef}
                  />
                  <Input
                    aria-label={intl.formatMessage(messages.promotionBandCount)}
                    min="1"
                    onChange={(event) => updateBand(row.key, { count: event.target.value })}
                    type="number"
                    value={row.count}
                  />
                  <Button onClick={() => removeBand(row.key)} type="button" variant="secondary">
                    <FormattedMessage {...messages.promotionRemoveBand} />
                  </Button>
                </li>
              ))}
            </ul>
            <Button onClick={addBand} type="button" variant="secondary">
              <FormattedMessage {...messages.promotionAddBand} />
            </Button>
          </div>
        </div>
        <footer className="cl-card__footer">
          <Button onClick={() => void savePlan()} type="button">
            <FormattedMessage {...messages.promotionSavePlan} />
          </Button>
        </footer>
      </Card>

      <Card
        aria-label={intl.formatMessage(messages.promotionReviewHeading)}
        className="cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.promotionReviewHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          {previewError && <Alert tone="destructive">{previewError}</Alert>}
          {preview && !previewError && (
            <ol className="cl-platform-update-list">
              {preview.combined.map((entrant, index) => (
                <li key={entrant.entrantId}>
                  <strong>{index + 1}.</strong> {entrant.entrantId.slice(-8)}
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );

  return <ListScreenLayout breadcrumb={breadcrumbNode} listing={listingNode} title={titleNode} />;
}
