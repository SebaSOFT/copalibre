import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
  type PromotionPreviewResponse,
  type ZoneResponse,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { Button } from './ui/atoms/button.js';
import { Card } from './ui/atoms/card.js';
import { Input } from './ui/atoms/input.js';
import { FormField } from './ui/molecules/form-field.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';

import { ListScreenTemplate } from './ui/templates/list-screen-template.js';

interface BandRow {
  readonly key: string;
  readonly zoneRef: string;
  readonly count: string;
}

let bandKeySequence = 0;
function nextKey(): string {
  bandKeySequence += 1;
  return `band-${bandKeySequence}`;
}

/**
 * A zone's promotion-plan configuration and review —
 * "decision support, not automation": saving a plan and reviewing its computed
 * candidate list never writes a next stage's seeding. Only `combination.mode
 * === 'group-order'` is offered here (no config needed); `ranked`/`manual`
 * need a pipeline- or order-authoring UI this screen doesn't build yet
 * (tracked as a follow-up, tasks.md section 6).
 */
export function PromotionPlanRoute({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  zoneNumber,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  readonly zoneNumber: number;
  readonly client?: ControlApiClient;
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

  const [zone, setZone] = useState<ZoneResponse>();
  const [nextStageNumber, setNextStageNumber] = useState('2');
  const [perGroupAdvance, setPerGroupAdvance] = useState('1');
  const [bands, setBands] = useState<readonly BandRow[]>([]);
  const [preview, setPreview] = useState<PromotionPreviewResponse>();
  const [previewError, setPreviewError] = useState<string>();
  const [loading, setLoading] = useState(true);

  const refreshPreview = useCallback(async (): Promise<void> => {
    const fetchPromotionPreview = api.fetchPromotionPreview;
    if (!fetchPromotionPreview) return;
    try {
      const loaded = await fetchPromotionPreview(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        zoneNumber,
      );
      setPreview(loaded);
      setPreviewError(undefined);
    } catch (error) {
      setPreview(undefined);
      setPreviewError(
        error instanceof ControlApiError
          ? error.message
          : intl.formatMessage(messages.promotionNoPlanYet),
      );
    }
  }, [api, organizationAlias, tournamentAlias, stageNumber, zoneNumber, intl]);

  useEffect(() => {
    let live = true;
    (api.listZones?.(organizationAlias, tournamentAlias, stageNumber) ?? Promise.resolve([]))
      .then((loadedZones) => {
        if (!live) return;
        const loadedZone = loadedZones.find((z) => z.number === zoneNumber);
        setZone(loadedZone);
        const zoneWithPlan = loadedZone as
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
        if (zoneWithPlan?.promotionPlan) {
          setNextStageNumber(String(zoneWithPlan.promotionPlan.nextStageNumber));
          if (zoneWithPlan.promotionPlan.rules.perGroupAdvance !== undefined) {
            setPerGroupAdvance(String(zoneWithPlan.promotionPlan.rules.perGroupAdvance));
          }
          if (zoneWithPlan.promotionPlan.rules.bands) {
            setBands(
              zoneWithPlan.promotionPlan.rules.bands.map((band) => ({
                key: nextKey(),
                zoneRef: band.zoneRef,
                count: String(band.count),
              })),
            );
          }
        }
      })
      .catch(() => {
        // Ignored for initial render; save path will re-validate.
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, stageNumber, zoneNumber]);

  useEffect(() => {
    let live = true;
    refreshPreview().then(() => {
      if (!live) return;
    });
    return () => {
      live = false;
    };
  }, [refreshPreview]);

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
    if (!api.savePromotionPlan) return;
    try {
      await api.savePromotionPlan(organizationAlias, tournamentAlias, stageNumber, zoneNumber, {
        nextStageNumber: Number(nextStageNumber),
        perGroupAdvance: Number(perGroupAdvance),
        combination: { mode: 'group-order' },
        ...(bands.length > 0
          ? {
              bands: bands
                .filter((row) => row.zoneRef.trim() !== '' && row.count.trim() !== '')
                .map((row) => ({ zoneRef: row.zoneRef.trim(), count: Number(row.count) })),
            }
          : {}),
      });
      push({ severity: 'success', message: intl.formatMessage(messages.promotionPlanSaved) });
      void refreshPreview();
    } catch (error) {
      pushError(error);
    }
  }

  if (loading) {
    return <p className="cl-inline-alert">{intl.formatMessage(messages.promotionLoading)}</p>;
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
    <div className="cl-platform-sections">
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
            <FormField
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
            </FormField>
            <FormField
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
            </FormField>
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
          {previewError && (
            <p className="cl-inline-alert" role="alert">
              {previewError}
            </p>
          )}
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

  return <ListScreenTemplate breadcrumb={breadcrumbNode} listing={listingNode} title={titleNode} />;
}
