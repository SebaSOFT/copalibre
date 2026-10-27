import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type StageDeletionResponse,
  type ZoneResponse,
} from '../../lib/api-client.js';
import { navigateControl } from '../../lib/control-navigation.js';
import { controlTokenStore } from '../../session/token-store.js';
import { useToast } from '../ToastProvider.js';
import { StageHubTemplate, type RoundZone } from '../screens/StageHubTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { EmptyState } from '../ui/molecules/empty-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * Moved from `SeedingBuilderPage.tsx`'s local `pageMessages` — ids renamed from `control.seedingBuilder.*` to `control.stageHub.*`
 * to match this screen's new home, same as the component itself.
 */
const pageMessages = defineMessages({
  stageDeleted: { id: 'control.stageHub.stageDeleted', defaultMessage: 'Stage deleted.' },
  stageDeleteUnavailable: {
    id: 'control.stageSettings.deleteUnavailable',
    defaultMessage: 'Stage removal is unavailable.',
  },
  stageRenamed: { id: 'control.stageHub.stageRenamed', defaultMessage: 'Stage renamed.' },
});

/** The formats whose next round the API derives from the previous one. */
const DYNAMIC_ROUND_FORMATS: readonly string[] = ['swiss', 'single-elimination'];

function roundZonesOf(zones: readonly ZoneResponse[], stageFormat: string): readonly RoundZone[] {
  return zones
    .map((zone) => ({
      zoneNumber: zone.number,
      zoneName: zone.name,
      format: zone.effectiveFormat ?? zone.format ?? stageFormat,
    }))
    .filter((zone) => DYNAMIC_ROUND_FORMATS.includes(zone.format));
}

/**
 * The Stage hub's own data-fetching (mirrors `ZoneGroupPage`): calls the same
 * `listStages` read the Tournament hub uses and finds its own `stageNumber`
 * in the result (one list, two callers), rather
 * than adding a second, narrower endpoint just for this screen.
 */
export function StageHubPage({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
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

  const title = intl.formatMessage(messages.stageHubTitle, { number: stageNumber });
  const [deletePreview, setDeletePreview] = useState<StageDeletionResponse | undefined>();
  const [deleteBusy, setDeleteBusy] = useState(false);
  const tournamentRead = useResilientRead(
    `control-stage-hub-name:${organizationAlias}:${tournamentAlias}`,
    () =>
      api.fetchTournamentSettings?.(organizationAlias, tournamentAlias) ??
      Promise.resolve(undefined),
    { thing: intl.formatMessage(messages.tournamentHubTitle) },
  );
  const read = useResilientRead(
    `control-stage-hub:${organizationAlias}:${tournamentAlias}:${stageNumber}`,
    async () => {
      const stages = await (api.listStages?.(organizationAlias, tournamentAlias) ??
        Promise.resolve([]));
      const stage = stages.find((candidate) => candidate.number === stageNumber);
      const zones = stage?.seeded
        ? await (api.listZones?.(organizationAlias, tournamentAlias, stageNumber) ??
            Promise.resolve([]))
        : [];
      return { stage, zones };
    },
    { thing: title, isEmpty: (data) => data.stage === undefined },
  );
  const stage = read.data?.stage;
  const zones = read.data?.zones ?? [];
  const reload = read.retry;

  async function onRename(name: string): Promise<void> {
    try {
      await api.updateStage?.(organizationAlias, tournamentAlias, stageNumber, { name });
      push({ severity: 'success', message: intl.formatMessage(pageMessages.stageRenamed) });
      await reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function onChangeFormat(format: string): Promise<void> {
    try {
      await api.updateStage?.(organizationAlias, tournamentAlias, stageNumber, { format });
      await reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function onGenerateNextRound(zoneNumber: number): Promise<void> {
    const zoneName = zones.find((zone) => zone.number === zoneNumber)?.name ?? String(zoneNumber);
    try {
      await api.generateNextRound?.(organizationAlias, tournamentAlias, stageNumber, {
        zoneNumber,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.stageRoundsGenerated, { zone: zoneName }),
      });
    } catch (error) {
      pushError(error);
    }
  }

  async function onDelete(): Promise<void> {
    try {
      if (!api.previewDeleteStage) {
        throw new Error(intl.formatMessage(pageMessages.stageDeleteUnavailable));
      }
      setDeletePreview(
        await api.previewDeleteStage(organizationAlias, tournamentAlias, stageNumber),
      );
    } catch (error) {
      pushError(error);
    }
  }

  async function onConfirmDelete(): Promise<void> {
    if (!deletePreview) return;
    setDeleteBusy(true);
    try {
      if (!api.deleteStage) {
        throw new Error(intl.formatMessage(pageMessages.stageDeleteUnavailable));
      }
      await api.deleteStage(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        deletePreview.stageName,
      );
      setDeletePreview(undefined);
      push({ severity: 'success', message: intl.formatMessage(pageMessages.stageDeleted) });
      navigateControl(`/control/${organizationAlias}/tournaments/${tournamentAlias}`);
    } catch (error) {
      pushError(error);
    } finally {
      setDeleteBusy(false);
    }
  }

  if (read.data === undefined) return <ReadState {...read} title={title} />;
  if (!stage)
    return (
      <EmptyState
        icon="trophy"
        heading={title}
        description={intl.formatMessage(messages.stageHubNotFound, { number: stageNumber })}
        action={{
          label: intl.formatMessage(messages.navDashboard),
          onClick: () =>
            navigateControl(`/control/${organizationAlias}/tournaments/${tournamentAlias}`),
        }}
      />
    );

  return (
    <ReadState {...read} title={title}>
      <StageHubTemplate
        availableFormats={stage.availableFormats ?? []}
        deleteBusy={deleteBusy}
        deletePreview={deletePreview}
        formatDescriptions={stage.formatDescriptions}
        onChangeFormat={onChangeFormat}
        onDelete={onDelete}
        onDeletePreviewOpenChange={(open) => {
          if (!open) setDeletePreview(undefined);
        }}
        onConfirmDelete={onConfirmDelete}
        onGenerateNextRound={onGenerateNextRound}
        onRename={onRename}
        organizationAlias={organizationAlias}
        roundZones={roundZonesOf(zones, stage.format)}
        seeded={stage.seeded ?? false}
        stageFormat={stage.format}
        stageName={stage.name}
        stageNumber={stageNumber}
        tournamentName={tournamentRead.data?.name}
        tournamentAlias={tournamentAlias}
      />
    </ReadState>
  );
}
