import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import {
  QualificationTemplate,
  type QualificationScreenState,
} from '../screens/QualificationTemplate.js';

/** Refusals the screen answers by showing the fresh preview, which says why. */
const PREVIEW_REFUSALS: ReadonlySet<string> = new Set([
  'qualification-stage-incomplete',
  'qualification-tie-unresolved',
]);

/**
 * Loads a stage's qualification preview and confirms it. Confirmation sends the positions the
 * organizer reviewed, so a result landing in between is refused instead of silently confirmed.
 */
export function QualificationPage({
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
  const [state, setState] = useState<QualificationScreenState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  /** The screen state the current preview yields; never rejects. */
  const fetchState = useCallback(async (): Promise<QualificationScreenState> => {
    try {
      if (!api.previewQualification) return { kind: 'failed' };
      const preview = await api.previewQualification(
        organizationAlias,
        tournamentAlias,
        stageNumber,
      );
      return { kind: 'loaded', preview };
    } catch (error) {
      return error instanceof ControlApiError && error.errorCode === 'qualification-plan-missing'
        ? { kind: 'empty' }
        : { kind: 'failed' };
    }
  }, [api, organizationAlias, tournamentAlias, stageNumber]);

  const load = async (): Promise<void> => setState(await fetchState());

  useEffect(() => {
    let live = true;
    void fetchState().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [fetchState]);

  async function confirm(): Promise<void> {
    if (state.kind !== 'loaded' || !api.confirmQualification) return;
    setBusy(true);
    try {
      const confirmed = await api.confirmQualification(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        {
          expected: state.preview.positions.flatMap((entry) =>
            entry.entrantId === undefined
              ? []
              : [
                  {
                    promotionPlanId: entry.promotionPlanId,
                    position: entry.position,
                    entrantId: entry.entrantId,
                  },
                ],
          ),
        },
      );
      setState({ kind: 'loaded', preview: confirmed });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.qualificationConfirmSucceeded, {
          count: confirmed.changedSides,
        }),
      });
    } catch (error) {
      if (error instanceof ControlApiError && error.errorCode === 'qualification-preview-stale') {
        push({ severity: 'info', message: intl.formatMessage(messages.qualificationPreviewMoved) });
        await load();
      } else if (error instanceof ControlApiError && PREVIEW_REFUSALS.has(error.errorCode ?? '')) {
        await load();
      } else {
        pushError(error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <QualificationTemplate
      busy={busy}
      onConfirm={confirm}
      organizationAlias={organizationAlias}
      stageNumber={stageNumber}
      state={state}
      tournamentAlias={tournamentAlias}
    />
  );
}
