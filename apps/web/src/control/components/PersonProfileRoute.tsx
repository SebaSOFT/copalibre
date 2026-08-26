import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  createControlApiClient,
  personPhotoUrl,
  type ControlApiClient,
  type PersonResponse,
} from '../lib/api-client.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { countryFlag, countryName } from '../lib/country.js';
import { isSupportedLanguage } from '@copalibre/domain';
import { controlTokenStore } from '../session/token-store.js';
import { FramedImage } from './FramedImage.js';
import { PersonPhotoPlaceholder } from './placeholders.js';
import { FieldValue } from './ui/molecules/field-value.js';
import { messages } from '../i18n/messages.en.js';

import { ListScreenTemplate } from './ui/templates/list-screen-template.js';

type LoadStatus = 'loading' | 'ready' | 'failed';

/**
 * A minimal person-profile view (0093 task 4.5, 0147 template migration):
 * photo-or-placeholder, display name, nationality flag, natural key. No edit
 * affordances here — nationality and photo are set from the registration review
 * screen's expanded row (design.md's non-goal rules out a separate "edit person"
 * screen).
 */
export function PersonProfileRoute({
  organizationAlias,
  personId,
  client,
}: {
  readonly organizationAlias: string;
  readonly personId: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
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

  const backHref = `/control/${organizationAlias}`;

  if (status === 'loading') {
    return (
      <p className="cl-inline-alert">
        <FormattedMessage {...messages.personProfileLoading} />
      </p>
    );
  }
  if (status === 'failed' || person === undefined) {
    return (
      <p className="cl-inline-alert">
        <FormattedMessage {...messages.personProfileLoadFailed} />
      </p>
    );
  }

  const titleNode = (
    <>
      {person.nationality !== undefined && (
        <span aria-hidden="true">{countryFlag(person.nationality)} </span>
      )}
      {person.displayName}
    </>
  );

  const breadcrumbNode = (
    <a className="cl-focusable" href={backHref} onClick={controlLinkClick(backHref)}>
      {intl.formatMessage(messages.personProfileBack)}
    </a>
  );

  const cardNode = (
    <div className="cl-card cl-chamfer cl-chamfer--control">
      <FramedImage
        key={person.photoObjectId ?? 'none'}
        alt={intl.formatMessage(messages.personProfilePhotoAlt, {
          displayName: person.displayName,
        })}
        placeholder={
          <PersonPhotoPlaceholder
            title={intl.formatMessage(messages.personProfilePhotoPlaceholderAlt)}
          />
        }
        size={96}
        src={
          person.photoObjectId !== undefined
            ? personPhotoUrl(organizationAlias, personId)
            : undefined
        }
      />

      <FieldValue
        label={intl.formatMessage(messages.personProfileNationalityLabel)}
        value={
          person.nationality === undefined
            ? intl.formatMessage(messages.reviewNationalityNone)
            : countryName(person.nationality, language)
        }
      />
      <FieldValue
        label={intl.formatMessage(messages.personProfileNaturalKeyLabel)}
        value={
          person.naturalKey === undefined
            ? intl.formatMessage(messages.personProfileNaturalKeyUnavailable)
            : `${person.naturalKey.kind}: ${person.naturalKey.value}`
        }
      />
    </div>
  );

  return <ListScreenTemplate breadcrumb={breadcrumbNode} listing={cardNode} title={titleNode} />;
}
