import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { useToast } from '../ToastProvider.js';
import { messages } from '../../i18n/messages.en.js';
import {
  buildOverlayUrl,
  type BroadcastChroma,
  type BroadcastOverlayMode,
} from '../../lib/broadcaster-studio.js';
import { BroadcasterStudioTemplate } from '../screens/BroadcasterStudioTemplate.js';

/**
 * Issues one streamer-scoped display token per visit (spec.md's own
 * scenario: "WHEN a streamer visits... THEN the system generates a scoped
 * display token") and derives the OBS URL from it — no data-fetching or
 * URL logic lives in the template.
 */
export function BroadcasterStudioPage({
  organizationAlias,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
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

  // A client missing this method can never succeed — derived, not state, so
  // the effect below has nothing to synchronously set on mount for this case.
  const unsupported = api.issueDisplayToken === undefined;

  const [issuedUrl, setIssuedUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(!unsupported);
  const [fetchError, setFetchError] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<BroadcastOverlayMode>('overlay-lower');
  const [chroma, setChroma] = useState<BroadcastChroma>('transparent');

  useEffect(() => {
    const issue = api.issueDisplayToken;
    if (!issue) return undefined;
    let live = true;
    issue(organizationAlias, tournamentAlias, { label: 'Broadcaster Studio' })
      .then((result) => {
        if (!live) return;
        setIssuedUrl(result.url);
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setFetchError(intl.formatMessage(messages.broadcasterStudioLoadError));
        setLoading(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- issuing a fresh token every render `api`/`intl` identity changes would mint tokens the operator never asked for; organizationAlias/tournamentAlias are this page's real identity.
  }, [organizationAlias, tournamentAlias]);

  const error = unsupported ? intl.formatMessage(messages.broadcasterStudioLoadError) : fetchError;

  const overlayUrl = useMemo(
    () => (issuedUrl === undefined ? undefined : buildOverlayUrl(issuedUrl, mode, chroma)),
    [issuedUrl, mode, chroma],
  );

  function copy(): void {
    if (overlayUrl === undefined) return;
    void navigator.clipboard.writeText(overlayUrl).then(
      () =>
        push({
          severity: 'success',
          message: intl.formatMessage(messages.broadcasterStudioCopySuccess),
        }),
      () => pushError(new Error(intl.formatMessage(messages.broadcasterStudioCopyFailure))),
    );
  }

  return (
    <BroadcasterStudioTemplate
      chroma={chroma}
      error={error}
      loading={loading}
      mode={mode}
      onChromaChange={setChroma}
      onCopy={copy}
      onModeChange={setMode}
      overlayUrl={overlayUrl}
    />
  );
}
