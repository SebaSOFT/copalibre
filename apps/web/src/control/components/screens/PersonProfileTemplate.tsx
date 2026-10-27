import { useState } from 'react';
import { useIntl } from 'react-intl';
import { personPhotoUrl, type PersonResponse } from '../../lib/api-client.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { countryFlag, countryName } from '../../lib/country.js';
import { isSupportedLanguage } from '@copalibre/domain';
import { FramedImage } from '../FramedImage.js';
import { PersonPhotoPlaceholder } from '../placeholders.js';
import { Card } from '../ui/atoms/card.js';
import { FieldValue } from '../ui/molecules/field-value.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Label } from '../ui/atoms/label.js';
import { Alert } from '../ui/atoms/alert.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

/**
 * Composes the screen from the data `PersonProfilePage` supplies. The page
 * owns the API request; this template owns the visibility control's feedback.
 */
export function PersonProfileTemplate({
  organizationAlias,
  person,
  personId,
  onSetPublicVisibility,
}: {
  readonly organizationAlias: string;
  readonly person: PersonResponse;
  readonly personId: string;
  readonly onSetPublicVisibility: (hiddenFromPublic: boolean) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string>();
  const [visibilitySaved, setVisibilitySaved] = useState(false);
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
            ? personPhotoUrl(organizationAlias, personId, '', person.photoObjectId)
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
      <div>
        <Label className="cl-toggle cl-focusable" htmlFor="person-hidden-from-public">
          <Checkbox
            aria-describedby="person-hidden-from-public-help"
            checked={person.hiddenFromPublic}
            disabled={visibilityBusy}
            id="person-hidden-from-public"
            onCheckedChange={(hiddenFromPublic) => {
              setVisibilityBusy(true);
              setVisibilityError(undefined);
              setVisibilitySaved(false);
              void onSetPublicVisibility(hiddenFromPublic)
                .then(() => setVisibilitySaved(true))
                .catch((cause: unknown) =>
                  setVisibilityError(cause instanceof Error ? cause.message : String(cause)),
                )
                .finally(() => setVisibilityBusy(false));
            }}
          />
          <span>{intl.formatMessage(messages.personProfileHiddenLabel)}</span>
        </Label>
        <p id="person-hidden-from-public-help">
          {intl.formatMessage(messages.personProfileHiddenHelp)}
        </p>
        {visibilityError !== undefined && <Alert tone="destructive">{visibilityError}</Alert>}
        {visibilitySaved && (
          <Alert tone="success">{intl.formatMessage(messages.personProfileVisibilitySaved)}</Alert>
        )}
      </div>
    </Card>
  );

  return <ListScreenLayout breadcrumb={breadcrumbNode} listing={cardNode} title={titleNode} />;
}
