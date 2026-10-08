import { useEffect, useMemo, useState } from 'react';
import { Alert, type AlertTone } from '../ui/atoms/alert.js';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  ControlApiError,
  type ControlApiClient,
  type HookScriptVocabulary,
} from '../../lib/api-client.js';
import type { DisciplineOption } from '../../lib/wizard.js';
import { controlTokenStore } from '../../session/token-store.js';
import { TournamentSetupWizard } from '../TournamentSetupWizard.js';
import { messages } from '../../i18n/messages.en.js';

type AuthoringStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'noDisciplines' }
  | { readonly kind: 'loadFailed' }
  | { readonly kind: 'creating' }
  | { readonly kind: 'created'; readonly alias: string }
  | { readonly kind: 'createFailed'; readonly message?: string };

/**
 * No `ListScreenLayout`/`FormScreenLayout`/`AuthScreenLayout`/
 * `MatchConsoleLayout` here: a multi-step wizard's
 * shape — step navigation, one step's fields visible at a time — matches
 * none of the four, and `TournamentSetupWizard` is itself the established
 * layout for that shape across the app (`ProfileBuilderWizard`,
 * `DescriptorBuilderWizard` compose the same way).
 */
export function TournamentAuthoringTemplate({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element | null {
  const intl = useIntl();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const [disciplines, setDisciplines] = useState<readonly DisciplineOption[]>([]);
  const [vocabulary, setVocabulary] = useState<HookScriptVocabulary>({ hooks: [], entries: [] });
  const [status, setStatus] = useState<AuthoringStatus>({ kind: 'loading' });
  const [dismissedStatusMessage, setDismissedStatusMessage] = useState<string>();

  useEffect(() => {
    let live = true;
    Promise.all([
      api.listDisciplines(),
      api.fetchCustomScriptVocabulary?.(organizationAlias) ??
        Promise.resolve<HookScriptVocabulary>({ hooks: [], entries: [] }),
    ])
      .then(([loaded, loadedVocabulary]) => {
        if (!live) return;
        setDisciplines(loaded);
        setVocabulary(loadedVocabulary);
        setStatus(loaded.length === 0 ? { kind: 'noDisciplines' } : { kind: 'ready' });
      })
      .catch(() => {
        if (live) setStatus({ kind: 'loadFailed' });
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias]);

  /**
   * One alert shows loading, an empty catalogue and a load failure, so its tone
   * follows the status rather than being fixed at the call site — the tone is a
   * claim about what happened, and here what happened varies.
   */
  function toneFor(current: AuthoringStatus): AlertTone {
    switch (current.kind) {
      case 'loadFailed':
      case 'createFailed':
        return 'destructive';
      case 'noDisciplines':
        return 'warning';
      case 'created':
        return 'success';
      default:
        return 'info';
    }
  }

  function statusMessage(current: AuthoringStatus): string | undefined {
    switch (current.kind) {
      case 'loading':
        return intl.formatMessage(messages.authoringLoadingDisciplines);
      case 'noDisciplines':
        return intl.formatMessage(messages.authoringNoDisciplines);
      case 'loadFailed':
        return intl.formatMessage(messages.authoringLoadFailed);
      case 'creating':
        return intl.formatMessage(messages.authoringCreating);
      case 'created':
        return intl.formatMessage(messages.authoringCreated, { alias: current.alias });
      case 'createFailed':
        return current.message ?? intl.formatMessage(messages.authoringCreateFailed);
      case 'ready':
        return undefined;
    }
  }

  function statusAlert(current: AuthoringStatus): React.JSX.Element | null {
    const message = statusMessage(current);
    if (message === undefined) return null;
    const tone = toneFor(current);
    const dismissible = tone === 'info' || tone === 'warning';
    if (dismissible && dismissedStatusMessage === message) return null;

    return (
      <Alert
        {...(dismissible
          ? {
              dismissLabel: intl.formatMessage(messages.toastDismiss),
              onDismiss: () => setDismissedStatusMessage(message),
            }
          : {})}
        tone={tone}
      >
        {message}
      </Alert>
    );
  }

  if (disciplines.length === 0) {
    return statusAlert(status);
  }

  return (
    <>
      {status.kind !== 'ready' && statusAlert(status)}
      <TournamentSetupWizard
        disciplines={disciplines}
        loadProfiles={api.listCompatibleProfiles}
        vocabulary={vocabulary}
        onSubmit={(request) => {
          setStatus({ kind: 'creating' });
          api
            .createTournament(organizationAlias, request)
            .then((created) => setStatus({ kind: 'created', alias: created.alias }))
            .catch((error: unknown) =>
              setStatus({
                kind: 'createFailed',
                ...(error instanceof ControlApiError ? { message: error.message } : {}),
              }),
            );
        }}
      />
    </>
  );
}
