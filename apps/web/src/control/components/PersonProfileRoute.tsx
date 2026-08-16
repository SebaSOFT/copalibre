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
import { PersonPhotoPlaceholder } from './placeholders.js';
import { messages } from '../i18n/messages.en.js';

type LoadStatus = 'loading' | 'ready' | 'failed';

/**
 * A minimal person-profile view (0093 task 4.5): photo-or-placeholder,
 * display name, nationality flag, natural key. No edit affordances here —
 * nationality and photo are set from the registration review screen's
 * expanded row (design.md's non-goal rules out a separate "edit person"
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
  const [photoFailed, setPhotoFailed] = useState(false);

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

  return (
    <section aria-label={intl.formatMessage(messages.personProfileTitle)} style={stackStyle}>
      <a
        className="cl-focusable"
        href={backHref}
        onClick={controlLinkClick(backHref)}
        style={backLinkStyle}
      >
        {intl.formatMessage(messages.personProfileBack)}
      </a>

      <div className="cl-card cl-chamfer cl-chamfer--control" style={cardStyle}>
        {person.photoObjectId !== undefined && !photoFailed ? (
          <img
            alt={intl.formatMessage(messages.personProfilePhotoAlt, {
              displayName: person.displayName,
            })}
            height={96}
            onError={() => setPhotoFailed(true)}
            src={personPhotoUrl(organizationAlias, personId)}
            width={96}
          />
        ) : (
          <PersonPhotoPlaceholder
            title={intl.formatMessage(messages.personProfilePhotoPlaceholderAlt)}
          />
        )}

        <h1 style={nameStyle}>
          {person.nationality !== undefined && (
            <span aria-hidden="true">{countryFlag(person.nationality)} </span>
          )}
          {person.displayName}
        </h1>

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
    </section>
  );
}

function FieldValue({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div style={fieldValueStyle}>
      <span style={smallStyle}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const stackStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-4)' };
const backLinkStyle: React.CSSProperties = {
  color: 'var(--cl-state-live)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
};
const cardStyle: React.CSSProperties = {
  display: 'grid',
  justifyItems: 'start',
  gap: 'var(--cl-space-3)',
  padding: 'var(--cl-space-4)',
};
const nameStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-display)',
  fontSize: '2rem',
  textTransform: 'uppercase',
};
const smallStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
};
const fieldValueStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-1)',
  background: 'var(--cl-surface-base)',
  padding: 'var(--cl-space-3)',
  border: '1px solid var(--cl-border-muted)',
};
