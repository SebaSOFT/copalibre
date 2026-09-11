import { useIntl } from 'react-intl';
import { personPhotoUrl, type PersonResponse } from '../../lib/api-client.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { countryFlag, countryName } from '../../lib/country.js';
import { isSupportedLanguage } from '@copalibre/domain';
import { FramedImage } from '../FramedImage.js';
import { PersonPhotoPlaceholder } from '../placeholders.js';
import { Card } from '../ui/atoms/card.js';
import { FieldValue } from '../ui/molecules/field-value.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

/**
 * Composes the screen from the data `PersonProfilePage` supplies (openspec
 * 0225 task 6.2): purely presentational, no API client reference — read
 * only, with no screen state of its own.
 */
export function PersonProfileTemplate({
  organizationAlias,
  person,
  personId,
}: {
  readonly organizationAlias: string;
  readonly person: PersonResponse;
  readonly personId: string;
}): React.JSX.Element {
  const intl = useIntl();
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
  const backHref = `/control/${organizationAlias}`;

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
    <Card className="cl-chamfer cl-chamfer--control">
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
    </Card>
  );

  return <ListScreenLayout breadcrumb={breadcrumbNode} listing={cardNode} title={titleNode} />;
}
