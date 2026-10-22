import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type PersonResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { PersonProfileTemplate } from '../screens/PersonProfileTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * A minimal person-profile view:
 * photo-or-placeholder, display name, nationality flag, natural key. No edit
 * affordances here — nationality and photo are set from the registration review
 * screen's expanded row (a separate "edit person"
 * screen is deliberately out of scope).
 *
 * Fetches: the person load lives here;
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
  const read = useResilientRead<PersonResponse>(
    `control-person-profile:${organizationAlias}:${personId}`,
    async () => {
      if (!api.getPerson) throw new Error('Person profile is unavailable');
      const person = await api.getPerson(organizationAlias, personId);
      if (!person) throw new Error('Person profile was empty');
      return person;
    },
    { thing: intl.formatMessage(messages.personProfileTitle) },
  );

  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.personProfileTitle)} />;
  return (
    <ReadState {...read} title={intl.formatMessage(messages.personProfileTitle)}>
      <PersonProfileTemplate
        organizationAlias={organizationAlias}
        person={read.data as PersonResponse}
        personId={personId}
      />
    </ReadState>
  );
}
