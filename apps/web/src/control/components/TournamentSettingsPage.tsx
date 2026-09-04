import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { controlLinkClick } from '../lib/control-navigation.js';
import { Button } from './ui/atoms/button.js';
import { FormField } from './ui/molecules/form-field.js';
import { ListScreenTemplate } from './ui/templates/list-screen-template.js';
import { FramedImage } from './FramedImage.js';
import { ClubEmblemPlaceholder } from './placeholders.js';
import { ImageCropModal } from './ImageCropModal.js';
import {
  tournamentEmblemUrl,
  type MutationFieldPreview,
  type TournamentSettingsRequest,
  type TournamentSettingsResponse,
} from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';

const FIELD_LABEL: Record<string, string> = {
  name: 'name',
  'registration.region': 'region',
  'registration.capacity': 'capacity',
  'registration.checkInClosesAt': 'checkInClosesAt',
};

/**
 * A tournament's editable name/region/capacity/check-in close time, with a
 * preview step reporting each changed field's classification before it is
 * applied — the same shape a series-mutation preview already uses (design.md).
 */
export function TournamentSettingsPage({
  organizationAlias,
  tournamentAlias,
  settings,
  onPreview,
  onSave,
  onUploadEmblem,
  onDeleteEmblem,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly settings: TournamentSettingsResponse;
  readonly onPreview?: (
    request: TournamentSettingsRequest,
  ) => Promise<readonly MutationFieldPreview[]>;
  readonly onSave?: (request: TournamentSettingsRequest) => Promise<void>;
  readonly onUploadEmblem?: (output: {
    readonly contentBase64: string;
    readonly contentType: 'image/png';
  }) => Promise<void>;
  readonly onDeleteEmblem?: () => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [name, setName] = useState(settings.name);
  const [region, setRegion] = useState(settings.region ?? '');
  const [capacity, setCapacity] = useState(
    settings.capacity === undefined ? '' : String(settings.capacity),
  );
  const [checkInClosesAt, setCheckInClosesAt] = useState(settings.checkInClosesAt ?? '');
  const [preview, setPreview] = useState<readonly MutationFieldPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [emblemCropSrc, setEmblemCropSrc] = useState<string | undefined>(undefined);
  const [emblemBusy, setEmblemBusy] = useState(false);
  const [emblemNotice, setEmblemNotice] = useState<string | undefined>(undefined);

  function draft(): TournamentSettingsRequest {
    return {
      ...(name === settings.name ? {} : { name }),
      ...(region === (settings.region ?? '') ? {} : { region }),
      ...(capacity === (settings.capacity === undefined ? '' : String(settings.capacity))
        ? {}
        : { capacity: capacity.trim() === '' ? undefined : Number(capacity) }),
      ...(checkInClosesAt === (settings.checkInClosesAt ?? '')
        ? {}
        : { checkInClosesAt: checkInClosesAt.trim() === '' ? undefined : checkInClosesAt }),
    };
  }

  const blockedField = preview.find(
    (field) => field.blocked || field.mutationClass === 'blocked_after_results',
  );

  const breadcrumbNode = (
    <span>
      {organizationAlias} &gt; {tournamentAlias}
    </span>
  );

  return (
    <ListScreenTemplate
      breadcrumb={breadcrumbNode}
      listing={
        <>
          <form
            className="cl-platform-form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError(undefined);
              setSaved(false);
              void onSave?.(draft())
                .then(() => setSaved(true))
                .catch((cause: unknown) =>
                  setError(cause instanceof Error ? cause.message : String(cause)),
                )
                .finally(() => setBusy(false));
            }}
          >
            <a
              className="cl-focusable"
              href={`/control/${organizationAlias}/tournaments/${tournamentAlias}/ruleset`}
              onClick={controlLinkClick(
                `/control/${organizationAlias}/tournaments/${tournamentAlias}/ruleset`,
              )}
            >
              <FormattedMessage {...messages.rulesetOverridesLink} />
            </a>
            <a
              className="cl-focusable"
              href={`/control/${organizationAlias}/tournaments/${tournamentAlias}/matches-view`}
              onClick={controlLinkClick(
                `/control/${organizationAlias}/tournaments/${tournamentAlias}/matches-view`,
              )}
            >
              <FormattedMessage {...messages.matchesViewSeeAll} />
            </a>
            <div
              className="cl-tournament-settings__emblem-section"
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cl-space-2)' }}
            >
              <span style={{ fontWeight: 'bold' }}>
                <FormattedMessage {...messages.settingsEmblemHeading} />
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-4)' }}>
                <FramedImage
                  key={settings.emblemObjectId ?? 'none'}
                  alt={intl.formatMessage(messages.settingsEmblemAlt)}
                  placeholder={
                    <ClubEmblemPlaceholder
                      size={64}
                      title={intl.formatMessage(messages.settingsEmblemPlaceholderAlt)}
                    />
                  }
                  size={64}
                  src={
                    settings.emblemObjectId !== undefined
                      ? tournamentEmblemUrl(organizationAlias, tournamentAlias)
                      : undefined
                  }
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cl-space-2)' }}>
                  {onUploadEmblem && (
                    <FormField
                      id="tournament-emblem-upload"
                      label={intl.formatMessage(messages.settingsUploadEmblem)}
                    >
                      <input
                        accept="image/*"
                        aria-label={intl.formatMessage(messages.settingsUploadEmblem)}
                        className="cl-input cl-input--default cl-focusable"
                        id="tournament-emblem-upload"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) setEmblemCropSrc(URL.createObjectURL(file));
                          event.currentTarget.value = '';
                        }}
                        type="file"
                      />
                    </FormField>
                  )}
                  {settings.emblemObjectId !== undefined && onDeleteEmblem && (
                    <Button
                      disabled={emblemBusy}
                      onClick={() => {
                        setEmblemBusy(true);
                        setEmblemNotice(undefined);
                        void onDeleteEmblem()
                          .then(() =>
                            setEmblemNotice(intl.formatMessage(messages.settingsEmblemRemoved)),
                          )
                          .catch((cause: unknown) =>
                            setError(cause instanceof Error ? cause.message : String(cause)),
                          )
                          .finally(() => setEmblemBusy(false));
                      }}
                      type="button"
                      variant="secondary"
                    >
                      <FormattedMessage {...messages.settingsRemoveEmblem} />
                    </Button>
                  )}
                </div>
              </div>
              {emblemNotice && (
                <p className="cl-inline-alert" role="status">
                  {emblemNotice}
                </p>
              )}
            </div>

            <FormField id="settings-name" label={intl.formatMessage(messages.settingsNameLabel)}>
              <input
                className="cl-input cl-input--default cl-focusable"
                id="settings-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </FormField>
            <FormField
              id="settings-region"
              label={intl.formatMessage(messages.settingsRegionLabel)}
            >
              <input
                className="cl-input cl-input--default cl-focusable"
                id="settings-region"
                onChange={(event) => setRegion(event.target.value)}
                value={region}
              />
            </FormField>
            <FormField
              id="settings-capacity"
              label={intl.formatMessage(messages.settingsCapacityLabel)}
            >
              <input
                className="cl-input cl-input--default cl-focusable"
                id="settings-capacity"
                onChange={(event) => setCapacity(event.target.value)}
                type="number"
                value={capacity}
              />
            </FormField>
            <FormField
              id="settings-check-in-closes-at"
              label={intl.formatMessage(messages.settingsCheckInClosesAtLabel)}
            >
              <input
                className="cl-input cl-input--default cl-focusable"
                id="settings-check-in-closes-at"
                onChange={(event) => setCheckInClosesAt(event.target.value)}
                type="datetime-local"
                value={checkInClosesAt}
              />
            </FormField>

            <div className="cl-role-user">
              <Button
                onClick={() => {
                  setBusy(true);
                  setError(undefined);
                  void onPreview?.(draft())
                    .then(setPreview)
                    .catch((cause: unknown) =>
                      setError(cause instanceof Error ? cause.message : String(cause)),
                    )
                    .finally(() => setBusy(false));
                }}
                type="button"
                variant="secondary"
              >
                <FormattedMessage {...messages.settingsPreview} />
              </Button>
              <Button disabled={busy || blockedField !== undefined} type="submit">
                <FormattedMessage {...messages.settingsSave} />
              </Button>
            </div>

            {preview.length > 0 && (
              <ul aria-label={intl.formatMessage(messages.settingsPreview)}>
                {preview.map((field) => (
                  <li key={field.field}>
                    <strong>{FIELD_LABEL[field.field] ?? field.field}</strong>:{' '}
                    {field.blocked
                      ? field.reason
                      : intl.formatMessage(messages.settingsMutationClass, {
                          mutationClass: field.mutationClass ?? 'safe',
                        })}
                  </li>
                ))}
              </ul>
            )}

            {error !== undefined && (
              <p className="cl-inline-alert" role="alert">
                {error}
              </p>
            )}
            {saved && (
              <p className="cl-inline-alert">
                <FormattedMessage {...messages.settingsSaved} />
              </p>
            )}
          </form>
          {emblemCropSrc !== undefined && (
            <ImageCropModal
              imageSrc={emblemCropSrc}
              onCancel={() => {
                URL.revokeObjectURL(emblemCropSrc);
                setEmblemCropSrc(undefined);
              }}
              onConfirm={(output) => {
                URL.revokeObjectURL(emblemCropSrc);
                setEmblemCropSrc(undefined);
                setEmblemBusy(true);
                setEmblemNotice(undefined);
                void onUploadEmblem?.(output)
                  .then(() => setEmblemNotice(intl.formatMessage(messages.settingsEmblemUploaded)))
                  .catch((cause: unknown) =>
                    setError(cause instanceof Error ? cause.message : String(cause)),
                  )
                  .finally(() => setEmblemBusy(false));
              }}
            />
          )}
        </>
      }
      title={<FormattedMessage {...messages.settingsTitle} />}
    />
  );
}
