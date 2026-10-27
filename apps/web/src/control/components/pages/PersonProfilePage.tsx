import { useMemo, useState } from 'react';
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
import { replaceResilientReadCache, useResilientRead } from './use-resilient-read.js';

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
  const cacheKey = `control-person-profile:${organizationAlias}:${personId}`;
  const [personOverride, setPersonOverride] = useState<
    { readonly requestKey: string; readonly person: PersonResponse } | undefined
  >(undefined);
  const read = useResilientRead<PersonResponse>(
    cacheKey,
    async () => {
      if (!api.getPerson) throw new Error('Person profile is unavailable');
      const person = await api.getPerson(organizationAlias, personId);
      if (!person) throw new Error('Person profile was empty');
      return person;
    },
    { thing: intl.formatMessage(messages.personProfileTitle) },
  );

  const person =
    (personOverride?.requestKey === cacheKey ? personOverride.person : undefined) ?? read.data;
  if (person === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.personProfileTitle)} />;
  return (
    <ReadState {...read} title={intl.formatMessage(messages.personProfileTitle)}>
      <PersonProfileTemplate
        organizationAlias={organizationAlias}
        onSetPublicVisibility={(hiddenFromPublic) => {
          if (!api.setPersonPublicVisibility) {
            return Promise.reject(new Error('Person public visibility is unavailable'));
          }
          return api
            .setPersonPublicVisibility(organizationAlias, personId, hiddenFromPublic)
            .then((result) => {
              const updated = { ...person, hiddenFromPublic: result.hiddenFromPublic };
              setPersonOverride({ requestKey: cacheKey, person: updated });
              replaceResilientReadCache(cacheKey, updated);
            });
        }}
        person={person}
        personId={personId}
      />
    </ReadState>
  );
}
