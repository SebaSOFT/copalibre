import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type PersonResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { PersonProfileTemplate } from '../screens/PersonProfileTemplate.js';

type LoadStatus = 'loading' | 'ready' | 'failed';

/**
 * A minimal person-profile view:
 * photo-or-placeholder, display name, nationality flag, natural key. No edit
 * affordances here — nationality and photo are set from the registration review
 * screen's expanded row (design.md's non-goal rules out a separate "edit person"
 * screen).
 *
 * Fetches (openspec 0225 task 6.2): the person load lives here;
 * `PersonProfileTemplate` composes the screen from the resulting data.
 */
export function PersonProfilePage({
  organizationAlias,
  personId,
  client,
}: {
  readonly organizationAlias: string;
  readonly personId: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const [person, setPerson] = useState<PersonResponse>();
  const [status, setStatus] = useState<LoadStatus>('loading');

  useEffect(() => {
    let live = true;
    api
      .getPerson?.(organizationAlias, personId)
      .then((loaded) => {
        if (live) {
          setPerson(loaded);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (live) setStatus('failed');
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, personId]);

  if (status === 'loading') {
    return (
      <Alert tone="info">
        <FormattedMessage {...messages.personProfileLoading} />
      </Alert>
    );
  }
  if (status === 'failed' || person === undefined) {
    return (
      <Alert tone="destructive">
        <FormattedMessage {...messages.personProfileLoadFailed} />
      </Alert>
    );
  }

  return (
    <PersonProfileTemplate
      organizationAlias={organizationAlias}
      person={person}
      personId={personId}
    />
  );
}
