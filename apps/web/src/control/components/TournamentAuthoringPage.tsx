import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import type { DisciplineOption } from '../lib/wizard.js';
import { TournamentSetupWizard } from './TournamentSetupWizard.js';
import { messages } from '../i18n/messages.en.js';

type AuthoringStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'noDisciplines' }
  | { readonly kind: 'loadFailed' }
  | { readonly kind: 'creating' }
  | { readonly kind: 'created'; readonly alias: string }
  | { readonly kind: 'createFailed' };

export function TournamentAuthoringPage({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const api = useMemo(
    () => client ?? createControlApiClient({ fetch: globalThis.fetch.bind(globalThis) }),
    [client],
  );
  const [disciplines, setDisciplines] = useState<readonly DisciplineOption[]>([]);
  const [status, setStatus] = useState<AuthoringStatus>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    api
      .listDisciplines()
      .then((loaded) => {
        if (!live) return;
        setDisciplines(loaded);
        setStatus(loaded.length === 0 ? { kind: 'noDisciplines' } : { kind: 'ready' });
      })
      .catch(() => {
        if (live) setStatus({ kind: 'loadFailed' });
      });
    return () => {
      live = false;
    };
  }, [api]);

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
        return intl.formatMessage(messages.authoringCreateFailed);
      case 'ready':
        return undefined;
    }
  }

  if (disciplines.length === 0) {
    return <p className="cl-inline-alert">{statusMessage(status)}</p>;
  }

  return (
    <>
      {status.kind !== 'ready' && <p className="cl-inline-alert">{statusMessage(status)}</p>}
      <TournamentSetupWizard
        disciplines={disciplines}
        onSubmit={(request) => {
          setStatus({ kind: 'creating' });
          api
            .createTournament(organizationAlias, request)
            .then((created) => setStatus({ kind: 'created', alias: created.alias }))
            .catch(() => setStatus({ kind: 'createFailed' }));
        }}
      />
    </>
  );
}
