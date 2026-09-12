import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { useIntl } from 'react-intl';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
  type PromotionPreviewResponse,
  type ZoneResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import { PromotionPlanTemplate, type BandRow } from '../screens/PromotionPlanTemplate.js';

/**
 * A zone's promotion-plan configuration and review —
 * "decision support, not automation": saving a plan and reviewing its computed
 * candidate list never writes a next stage's seeding. Only `combination.mode
 * === 'group-order'` is offered here (no config needed); `ranked`/`manual`
 * need a pipeline- or order-authoring UI this screen doesn't build yet
 * (tracked as a follow-up, tasks.md section 6).
 *
 * Fetches and mutates (openspec 0225 task 6.2): the zone and preview loads,
 * and the save mutation, live here; `PromotionPlanTemplate` composes the
 * screen from the resulting data.
 */
export function PromotionPlanPage({
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
  const [preview, setPreview] = useState<PromotionPreviewResponse>();
  const [previewError, setPreviewError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (api.listZones?.(organizationAlias, tournamentAlias, stageNumber) ?? Promise.resolve([]))
      .then((loadedZones) => {
        if (!live) return;
        setZone(loadedZones.find((z) => z.number === zoneNumber));
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
    const fetchPromotionPreview = api.fetchPromotionPreview;
    if (!fetchPromotionPreview) return undefined;
    fetchPromotionPreview(organizationAlias, tournamentAlias, stageNumber, zoneNumber)
      .then((loaded) => {
        if (!live) return;
        setPreview(loaded);
        setPreviewError(undefined);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setPreview(undefined);
        setPreviewError(
          error instanceof ControlApiError
            ? error.message
            : intl.formatMessage(messages.promotionNoPlanYet),
        );
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, stageNumber, zoneNumber, intl]);

  async function savePlan(
    nextStageNumber: string,
    perGroupAdvance: string,
    bands: readonly BandRow[],
  ): Promise<void> {
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
      if (api.fetchPromotionPreview) {
        try {
          const loaded = await api.fetchPromotionPreview(
            organizationAlias,
            tournamentAlias,
            stageNumber,
            zoneNumber,
          );
          setPreview(loaded);
          setPreviewError(undefined);
        } catch (previewErr) {
          setPreview(undefined);
          setPreviewError(
            previewErr instanceof ControlApiError
              ? previewErr.message
              : intl.formatMessage(messages.promotionNoPlanYet),
          );
        }
      }
    } catch (error) {
      pushError(error);
    }
  }

  if (loading) {
    return <Alert tone="info">{intl.formatMessage(messages.promotionLoading)}</Alert>;
  }

  return (
    <PromotionPlanTemplate
      onSave={savePlan}
      preview={preview}
      previewError={previewError}
      tournamentAlias={tournamentAlias}
      zone={zone}
      zoneNumber={zoneNumber}
    />
  );
}
