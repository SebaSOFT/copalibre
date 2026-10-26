import { useMemo } from 'react';
import { useIntl, type IntlShape } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
  type PromotionPreviewResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { formatEntrant } from '../../lib/presentation-formatting.js';
import { useToast } from '../ToastProvider.js';
import {
  PromotionPlanTemplate,
  type BandRow,
  type PreviewError,
} from '../screens/PromotionPlanTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * `promotion-plan-not-found` names specifically "this zone has
 * no saved plan yet" — an expected, benign state. Every other error this
 * endpoint can produce (a genuinely missing stage/zone, a network fault, a
 * business-rule refusal) shares the controller's generic `zone-group-not-found`
 * code or another one entirely, and keeps its own server message and the
 * destructive tone that message earns. A non-`ControlApiError` (shape
 * unexpected) falls to the same benign reading as before this fix, not a
 * behavior change.
 */
function classifyPreviewError(error: unknown, intl: IntlShape): PreviewError {
  if (error instanceof ControlApiError && error.errorCode !== 'promotion-plan-not-found') {
    return { message: error.message, tone: 'destructive' };
  }
  return { message: intl.formatMessage(messages.promotionNoPlanYet), tone: 'info' };
}

/**
 * A zone's promotion-plan configuration and review —
 * "decision support, not automation": saving a plan and reviewing its computed
 * candidate list never writes a next stage's seeding. Only `combination.mode
 * === 'group-order'` is offered here (no config needed); `ranked`/`manual`
 * need a pipeline- or order-authoring UI this screen doesn't build yet
 * (tracked as a follow-up).
 *
 * Fetches and mutates: the zone and preview loads,
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

  const read = useResilientRead(
    `control-promotion:${organizationAlias}:${tournamentAlias}:${stageNumber}:${zoneNumber}`,
    async () => {
      const [zones, entrants] = await Promise.all([
        api.listZones?.(organizationAlias, tournamentAlias, stageNumber) ?? Promise.resolve([]),
        api.listRegistrations(organizationAlias, tournamentAlias, 'accepted'),
      ]);
      let preview: PromotionPreviewResponse | undefined;
      let previewError: PreviewError | undefined;
      try {
        preview = await api.fetchPromotionPreview?.(
          organizationAlias,
          tournamentAlias,
          stageNumber,
          zoneNumber,
        );
      } catch (error) {
        if (!(error instanceof ControlApiError) || error.errorCode !== 'promotion-plan-not-found')
          throw error;
        previewError = classifyPreviewError(error, intl);
      }
      return {
        zone: zones.find((zone) => zone.number === zoneNumber),
        entrants,
        preview,
        previewError,
      };
    },
    { thing: intl.formatMessage(messages.promotionTitle) },
  );
  const { zone, entrants = [], preview, previewError } = read.data ?? {};
  function entrantLabel(entrantId: string): string {
    return formatEntrant(intl, {
      displayName: entrants.find((candidate) => candidate.entrantId === entrantId)?.displayName,
    }).fullName;
  }

  async function savePlan(
    nextStageNumber: string,
    perGroupAdvance: string,
    bands: readonly BandRow[],
  ): Promise<void> {
    if (!api.savePromotionPlan) return;
    try {
      const saved = await api.savePromotionPlan(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        zoneNumber,
        {
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
        },
      );
      push({ severity: 'success', message: intl.formatMessage(messages.promotionPlanSaved) });
      if (saved.mutationClass === 'requires_rebuild') {
        push({
          severity: 'info',
          message: intl.formatMessage(messages.promotionPlanRequiresRebuild, {
            stage: Number(nextStageNumber),
          }),
        });
      }
      await read.refresh();
    } catch (error) {
      pushError(error);
    }
  }

  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.promotionTitle)} />;

  return (
    <ReadState {...read} title={intl.formatMessage(messages.promotionTitle)}>
      <PromotionPlanTemplate
        entrantLabel={entrantLabel}
        onSave={savePlan}
        preview={preview}
        previewError={previewError}
        tournamentAlias={tournamentAlias}
        zone={zone}
        zoneNumber={zoneNumber}
      />
    </ReadState>
  );
}
