import { useMemo } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  organizationEmblemUrl,
  type ControlApiClient,
  type OrganizationResponse,
} from '../../lib/api-client.js';
import { FramedImage } from '../FramedImage.js';
import { ClubEmblemPlaceholder } from '../placeholders.js';
import { Card } from '../ui/atoms/card.js';
import { Form } from '../ui/atoms/form.js';
import { filePickerLabels } from '../../lib/file-picker-labels.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { Grid } from '../ui/atoms/layout/grid.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { Field } from '../ui/molecules/field.js';
import { FieldValue } from '../ui/molecules/field-value.js';
import { messages as controlMessages } from '../../i18n/messages.en.js';
import { type OrganizationSettingsDraft } from '../pages/PreferencesPage.js';
import { LANGUAGE_NAMES } from '../../i18n/LanguageSwitcher.js';
import { SUPPORTED_LANGUAGES } from '../../../lib/language-preference.js';
import { timeZoneOptions } from '../../lib/time-zones.js';
import { DropZone } from '../ui/organisms/drop-zone.js';
import { UnsavedChangesBar } from '../ui/organisms/unsaved-changes-bar.js';
import { whoCan } from './preferences-permissions.js';

/** The sizes the emblem renders at across the product, largest first. */
export const EMBLEM_PREVIEW_SIZES = [64, 48, 32] as const;

export function languageName(language: string): string {
  return (LANGUAGE_NAMES as Readonly<Record<string, string>>)[language] ?? language;
}

export function OrganizationIdentitySection({
  api,
  canManage,
  onChangeSettings,
  onResetSettings,
  onSaveOrganizationSettings,
  optimisticEmblemSrc,
  organization,
  organizationAlias,
  orgLoadError,
  orgLoading,
  setEmblemCropSrc,
  settingsDraft,
}: {
  readonly api: ControlApiClient;
  readonly canManage: boolean;
  readonly onChangeSettings: (change: Partial<OrganizationSettingsDraft>) => void;
  readonly onResetSettings: () => void;
  readonly onSaveOrganizationSettings: () => Promise<void>;
  readonly optimisticEmblemSrc: string | undefined;
  readonly organization: OrganizationResponse | undefined;
  readonly organizationAlias: string | undefined;
  readonly orgLoadError: string | undefined;
  readonly orgLoading: boolean;
  readonly setEmblemCropSrc: (source: string | undefined) => void;
  readonly settingsDraft: OrganizationSettingsDraft;
}): React.JSX.Element | null {
  const intl = useIntl();
  const languageOptions = useMemo(() => {
    const options = SUPPORTED_LANGUAGES.map((language) => ({
      value: language,
      label: LANGUAGE_NAMES[language],
      badge: language.toUpperCase(),
    }));
    return options.some((option) => option.value === settingsDraft.primaryLanguage) ||
      settingsDraft.primaryLanguage === ''
      ? options
      : [
          ...options,
          { value: settingsDraft.primaryLanguage, label: settingsDraft.primaryLanguage, badge: '' },
        ];
  }, [settingsDraft.primaryLanguage]);
  const zoneOptions = useMemo(
    () => timeZoneOptions(settingsDraft.timezone),
    [settingsDraft.timezone],
  );
  if (organizationAlias === undefined) return null;
  const emblemSrc =
    optimisticEmblemSrc ??
    (organization?.emblemObjectId !== undefined
      ? organizationEmblemUrl(organizationAlias)
      : undefined);

  const nameLabel = intl.formatMessage(controlMessages.orgIdentityName);
  const languageLabel = intl.formatMessage(controlMessages.orgIdentityLanguage);
  const timezoneLabel = intl.formatMessage(controlMessages.orgIdentityTimezone);
  const changedFields =
    organization === undefined
      ? []
      : [
          ...(settingsDraft.name.trim() !== organization.name
            ? [{ id: 'name', label: nameLabel }]
            : []),
          ...(settingsDraft.primaryLanguage !== organization.primaryLanguage
            ? [{ id: 'primaryLanguage', label: languageLabel }]
            : []),
          ...(settingsDraft.timezone !== organization.timezone
            ? [{ id: 'timezone', label: timezoneLabel }]
            : []),
        ];

  const emblemSizes = (
    <div className="cl-preferences-emblem-sizes">
      {emblemSrc === undefined ? (
        <FramedImage
          alt={intl.formatMessage(controlMessages.orgIdentityEmblemAlt)}
          placeholder={
            <ClubEmblemPlaceholder
              size={64}
              title={intl.formatMessage(controlMessages.orgIdentityEmblemPlaceholderAlt)}
            />
          }
          size={64}
          src={undefined}
        />
      ) : (
        EMBLEM_PREVIEW_SIZES.map((size) => (
          <FramedImage
            key={`${size}:${emblemSrc}`}
            alt={
              size === EMBLEM_PREVIEW_SIZES[0]
                ? intl.formatMessage(controlMessages.orgIdentityEmblemAlt)
                : ''
            }
            placeholder={null}
            size={size}
            src={emblemSrc}
          />
        ))
      )}
    </div>
  );

  return (
    <Card
      aria-label={intl.formatMessage(controlMessages.orgIdentityHeading)}
      className="cl-chamfer cl-chamfer--control cl-preferences-panel"
    >
      <h2>
        <FormattedMessage {...controlMessages.orgIdentityHeading} />
      </h2>

      {orgLoading ? (
        <p>
          <FormattedMessage {...controlMessages.orgIdentityLoading} />
        </p>
      ) : orgLoadError ? (
        <Alert tone="destructive">{orgLoadError}</Alert>
      ) : !canManage ? (
        <Stack gap="4">
          {emblemSizes}
          {organization !== undefined && (
            <Grid columns={3} gap="4">
              <FieldValue label={nameLabel} value={organization.name} />
              <FieldValue
                label={languageLabel}
                value={languageName(organization.primaryLanguage)}
              />
              <FieldValue label={timezoneLabel} value={organization.timezone} />
            </Grid>
          )}
          <p>
            {intl.formatMessage(
              controlMessages.orgIdentityWithheld,
              whoCan(intl, 'org.manage-settings'),
            )}
          </p>
        </Stack>
      ) : (
        <Stack gap="4">
          {emblemSizes}

          {api.uploadOrganizationEmblem && (
            <DropZone
              accept="image/*"
              aria-label={intl.formatMessage(controlMessages.orgIdentityUploadEmblem)}
              id="org-emblem-upload"
              label={intl.formatMessage(controlMessages.orgIdentityUploadEmblem)}
              onChange={(files) => {
                const file = files?.[0];
                if (file) setEmblemCropSrc(URL.createObjectURL(file));
              }}
              {...filePickerLabels(intl, { accept: 'image/*' })}
            />
          )}

          <Form
            className="cl-preferences-organization-identity-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onSaveOrganizationSettings();
            }}
          >
            <Grid columns={3} gap="4">
              <Field id="org-name" label={nameLabel}>
                <Input
                  id="org-name"
                  onChange={(event) => onChangeSettings({ name: event.target.value })}
                  type="text"
                  value={settingsDraft.name}
                />
              </Field>
              <Field
                helpText={intl.formatMessage(controlMessages.orgIdentityLanguageHelp)}
                id="org-language"
                label={languageLabel}
              >
                <Select
                  id="org-language"
                  onValueChange={(primaryLanguage) => onChangeSettings({ primaryLanguage })}
                  options={languageOptions}
                  value={settingsDraft.primaryLanguage}
                />
              </Field>
              <Field
                helpText={intl.formatMessage(controlMessages.orgIdentityTimezoneHelp)}
                id="org-timezone"
                label={timezoneLabel}
              >
                <Select
                  id="org-timezone"
                  onValueChange={(timezone) => onChangeSettings({ timezone })}
                  options={zoneOptions}
                  value={settingsDraft.timezone}
                />
              </Field>
            </Grid>
            <UnsavedChangesBar
              changedFields={changedFields}
              dirty={changedFields.length > 0}
              fieldsLabel={intl.formatMessage(controlMessages.unsavedChangesFields)}
              onReset={onResetSettings}
              onSave={() => void onSaveOrganizationSettings()}
              resetLabel={intl.formatMessage(controlMessages.unsavedChangesReset)}
              saveLabel={intl.formatMessage(controlMessages.orgIdentitySave)}
              summary={intl.formatMessage(controlMessages.unsavedChangesSummary, {
                count: changedFields.length,
              })}
            />
          </Form>
        </Stack>
      )}
    </Card>
  );
}
