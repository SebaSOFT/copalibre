import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { defineMessages, useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type StageResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { navigateControl } from '../../lib/control-navigation.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import { StageHubTemplate } from '../screens/StageHubTemplate.js';

/**
 * Moved from `SeedingBuilderPage.tsx`'s local `pageMessages` (openspec 0250
 * task 5.1) — ids renamed from `control.seedingBuilder.*` to `control.stageHub.*`
 * to match this screen's new home, same as the component itself.
 */
const pageMessages = defineMessages({
  stageDeleted: { id: 'control.stageHub.stageDeleted', defaultMessage: 'Stage deleted.' },
  stageRenamed: { id: 'control.stageHub.stageRenamed', defaultMessage: 'Stage renamed.' },
});

/**
 * The Stage hub's own data-fetching (mirrors `ZoneGroupPage`): calls the same
 * `listStages` read the Tournament hub uses and finds its own `stageNumber`
 * in the result (design.md - "Stage read": one list, two callers), rather
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

  const [stage, setStage] = useState<StageResponse | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const applyStages = useCallback(
    (stages: readonly StageResponse[]): void => {
      const found = stages.find((candidate) => candidate.number === stageNumber);
      if (found) {
        setStage(found);
        setLoadError(undefined);
      } else {
        setLoadError(intl.formatMessage(messages.stageHubNotFound, { number: stageNumber }));
      }
    },
    [stageNumber, intl],
  );

  const reload = useCallback(async (): Promise<void> => {
    const stages = await (api.listStages?.(organizationAlias, tournamentAlias) ??
      Promise.resolve([]));
    applyStages(stages);
  }, [api, organizationAlias, tournamentAlias, applyStages]);

  useEffect(() => {
    let live = true;
    (api.listStages?.(organizationAlias, tournamentAlias) ?? Promise.resolve([]))
      .then((stages) => {
        if (live) applyStages(stages);
      })
      .catch(() => {
        if (live) setLoadError(intl.formatMessage(messages.stageHubLoadFailed));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, applyStages, intl]);

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

  async function onDelete(): Promise<void> {
    try {
      await api.deleteStage?.(organizationAlias, tournamentAlias, stageNumber);
      push({ severity: 'success', message: intl.formatMessage(pageMessages.stageDeleted) });
      navigateControl(`/control/${organizationAlias}/tournaments/${tournamentAlias}`);
    } catch (error) {
      pushError(error);
    }
  }

  if (loading) {
    return <Alert tone="info">{intl.formatMessage(messages.stageHubLoading)}</Alert>;
  }

  if (loadError || !stage) {
    return <Alert tone="destructive">{loadError}</Alert>;
  }

  return (
    <StageHubTemplate
      onChangeFormat={onChangeFormat}
      onDelete={onDelete}
      onRename={onRename}
      organizationAlias={organizationAlias}
      seeded={stage.seeded ?? false}
      stageFormat={stage.format}
      stageName={stage.name}
      stageNumber={stageNumber}
      tournamentAlias={tournamentAlias}
    />
  );
}
