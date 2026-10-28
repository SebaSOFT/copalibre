import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { Button } from '../ui/atoms/button.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Card } from '../ui/atoms/card.js';
import { Label } from '../ui/atoms/label.js';
import { FilePicker } from '../ui/atoms/file-picker.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { filePickerLabels } from '../../lib/file-picker-labels.js';
import { Input } from '../ui/atoms/input.js';
import { Form } from '../ui/atoms/form.js';
import { Field } from '../ui/molecules/field.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';
import { FramedImage } from '../FramedImage.js';
import { ClubEmblemPlaceholder } from '../placeholders.js';
import { ImageCropModal } from '../ImageCropModal.js';
import {
  tournamentEmblemUrl,
  type MutationFieldPreview,
  type RulesetOverridesResponse,
  type TournamentSettingsRequest,
  type TournamentSettingsResponse,
} from '../../lib/api-client.js';
import { TournamentSummary } from '../ui/organisms/tournament-summary.js';
import { fieldValueAt, mergeOverrides } from '../../lib/discipline-summary.js';
import { formatDateTimeInputHint } from '../../lib/presentation-formatting.js';
import type { ConfigFieldPolicies } from '@copalibre/domain';
import { messages } from '../../i18n/messages.en.js';

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

const FIELD_LABEL: Record<string, string> = {
  name: 'name',
  'registration.region': 'region',
  'registration.capacity': 'capacity',
  'registration.checkInClosesAt': 'checkInClosesAt',
  minimumRestMinutes: 'minimumRestMinutes',
};

function SettingsActionArea({
  activeTab,
  blocked,
  busy,
  onPreview,
  preview,
}: {
  readonly activeTab: 'settings' | 'privacy';
  readonly blocked: boolean;
  readonly busy: boolean;
  readonly onPreview: () => void;
  readonly preview: readonly MutationFieldPreview[];
}): React.JSX.Element {
  const intl = useIntl();

  return (
    <>
      <div className="cl-role-user">
        {activeTab === 'settings' && (
          <Button onClick={onPreview} type="button" variant="secondary">
            <FormattedMessage {...messages.settingsPreview} />
          </Button>
        )}
        <Button disabled={busy || (activeTab === 'settings' && blocked)} type="submit">
          <FormattedMessage
            {...(activeTab === 'privacy' ? messages.settingsPrivacySave : messages.settingsSave)}
          />
        </Button>
      </div>

      {activeTab === 'settings' && preview.length > 0 && (
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
    </>
  );
}

/**
 * A tournament's editable name/region/capacity/check-in close time, with a
 * preview step reporting each changed field's classification before it is
 * applied — the same shape a series-mutation preview already uses.
 */
export function TournamentSettingsTemplate({
  organizationAlias,
  tournamentAlias,
  settings,
  initialTab = 'settings',
  ruleset,
  onPreview,
  onSave,
  onUploadEmblem,
  onDeleteEmblem,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly settings: TournamentSettingsResponse;
  readonly initialTab?: 'settings' | 'privacy';
  /** Additive context for the plain-language summary below. */
  readonly ruleset?: RulesetOverridesResponse;
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
  const rulesetFieldPolicies = (ruleset?.fieldPolicies ?? {}) as ConfigFieldPolicies;
  const mergedRulesetConfig = mergeOverrides(
    ruleset?.disciplineDefaults ?? {},
    ruleset?.overrides ?? {},
    rulesetFieldPolicies,
  );
  const [name, setName] = useState(settings.name);
  const [region, setRegion] = useState(settings.region ?? '');
  const [capacity, setCapacity] = useState(
    settings.capacity === undefined ? '' : String(settings.capacity),
  );
  const [checkInClosesAt, setCheckInClosesAt] = useState(settings.checkInClosesAt ?? '');
  const [featured, setFeatured] = useState(settings.featured);
  const storedRest =
    settings.minimumRestMinutes === undefined ? '' : String(settings.minimumRestMinutes);
  const [minimumRest, setMinimumRest] = useState(storedRest);
  const [includesMinors, setIncludesMinors] = useState(settings.includesMinors);
  const [showYouthProfiles, setShowYouthProfiles] = useState(settings.showYouthProfiles);
  const [activeTab, setActiveTab] = useState<'settings' | 'privacy'>(initialTab);
  const [preview, setPreview] = useState<readonly MutationFieldPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [emblemCropSrc, setEmblemCropSrc] = useState<string | undefined>(undefined);
  const [optimisticEmblemSrc, setOptimisticEmblemSrc] = useState<string | undefined>(undefined);
  const [emblemBusy, setEmblemBusy] = useState(false);
  const [emblemNotice, setEmblemNotice] = useState<string | undefined>(undefined);

  function draft(privacyOnly = false): TournamentSettingsRequest {
    if (privacyOnly) {
      return {
        ...(includesMinors === settings.includesMinors ? {} : { includesMinors }),
        ...(showYouthProfiles === settings.showYouthProfiles ? {} : { showYouthProfiles }),
      };
    }
    return {
      ...(name === settings.name ? {} : { name }),
      ...(region === (settings.region ?? '') ? {} : { region }),
      ...(capacity === (settings.capacity === undefined ? '' : String(settings.capacity))
        ? {}
        : { capacity: capacity.trim() === '' ? undefined : Number(capacity) }),
      ...(checkInClosesAt === (settings.checkInClosesAt ?? '')
        ? {}
        : { checkInClosesAt: checkInClosesAt.trim() === '' ? undefined : checkInClosesAt }),
      ...(featured === settings.featured ? {} : { featured }),
      // Cleared sends `null`: the rule is removed, not left as it was.
      ...(minimumRest === storedRest
        ? {}
        : { minimumRestMinutes: minimumRest.trim() === '' ? null : Number(minimumRest) }),
    };
  }

  function previewSettings(): void {
    setBusy(true);
    setError(undefined);
    void onPreview?.(draft())
      .then(setPreview)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  }

  const blockedField = preview.find(
    (field) => field.blocked || field.mutationClass === 'blocked_after_results',
  );

  const breadcrumbNode = (
    <span>
      {organizationAlias} &gt; {tournamentAlias}
    </span>
  );

  const sectionTabs = (
    <div
      aria-label={intl.formatMessage(messages.settingsSections)}
      className="cl-table-toolbar__filters"
      onKeyDown={(event) => {
        const tabOrder = ['settings', 'privacy'] as const;
        const currentIndex = tabOrder.indexOf(activeTab);
        const nextIndex =
          event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? (currentIndex + 1) % tabOrder.length
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? (currentIndex + tabOrder.length - 1) % tabOrder.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabOrder.length - 1
                  : currentIndex;
        if (nextIndex !== currentIndex) {
          event.preventDefault();
          const nextTab = tabOrder[nextIndex];
          if (nextTab !== undefined) {
            setActiveTab(nextTab);
            document.getElementById(`tournament-${nextTab}-tab`)?.focus();
          }
        }
      }}
      role="tablist"
    >
      <Button
        aria-controls="tournament-settings-panel"
        aria-selected={activeTab === 'settings'}
        id="tournament-settings-tab"
        onClick={() => setActiveTab('settings')}
        role="tab"
        tabIndex={activeTab === 'settings' ? 0 : -1}
        type="button"
        variant={activeTab === 'settings' ? 'primary' : 'secondary'}
      >
        <FormattedMessage {...messages.settingsTabGeneral} />
      </Button>
      <Button
        aria-controls="tournament-privacy-panel"
        aria-selected={activeTab === 'privacy'}
        id="tournament-privacy-tab"
        onClick={() => setActiveTab('privacy')}
        role="tab"
        tabIndex={activeTab === 'privacy' ? 0 : -1}
        type="button"
        variant={activeTab === 'privacy' ? 'primary' : 'secondary'}
      >
        <FormattedMessage {...messages.settingsTabPrivacy} />
      </Button>
    </div>
  );

  return (
    <ListScreenLayout
      breadcrumb={breadcrumbNode}
      toolbar={sectionTabs}
      listing={
        <>
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError(undefined);
              setSaved(false);
              void onSave?.(draft(activeTab === 'privacy'))
                .then(() => setSaved(true))
                .catch((cause: unknown) =>
                  setError(cause instanceof Error ? cause.message : String(cause)),
                )
                .finally(() => setBusy(false));
            }}
          >
            <div className="cl-tournament-settings__form-content">
              {activeTab === 'settings' ? (
                <div
                  aria-labelledby="tournament-settings-tab"
                  className="cl-tournament-settings__settings-panel"
                  id="tournament-settings-panel"
                  role="tabpanel"
                  tabIndex={0}
                >
                  <div className="cl-tournament-settings__related-links">
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
                  </div>
                  <div className="cl-tournament-settings__identity-grid">
                    <div className="cl-tournament-settings__emblem-section">
                      <span className="cl-tournament-settings__emblem-heading">
                        <FormattedMessage {...messages.settingsEmblemHeading} />
                      </span>
                      <div className="cl-tournament-settings__emblem-controls">
                        <FramedImage
                          key={
                            optimisticEmblemSrc ? 'optimistic' : (settings.emblemObjectId ?? 'none')
                          }
                          alt={intl.formatMessage(messages.settingsEmblemAlt)}
                          placeholder={
                            <ClubEmblemPlaceholder
                              size={64}
                              title={intl.formatMessage(messages.settingsEmblemPlaceholderAlt)}
                            />
                          }
                          size={64}
                          src={
                            optimisticEmblemSrc ??
                            (settings.emblemObjectId !== undefined
                              ? tournamentEmblemUrl(organizationAlias, tournamentAlias)
                              : undefined)
                          }
                        />
                        <div className="cl-tournament-settings__emblem-actions">
                          {onUploadEmblem && (
                            <FilePicker
                              accept="image/*"
                              aria-label={intl.formatMessage(messages.settingsUploadEmblem)}
                              id="tournament-emblem-upload"
                              label={intl.formatMessage(messages.settingsUploadEmblem)}
                              onChange={(files) => {
                                const file = files?.[0];
                                if (file) setEmblemCropSrc(URL.createObjectURL(file));
                              }}
                              {...filePickerLabels(intl, { accept: 'image/*' })}
                            />
                          )}
                          {settings.emblemObjectId !== undefined && onDeleteEmblem && (
                            <Button
                              disabled={emblemBusy}
                              onClick={() => {
                                setEmblemBusy(true);
                                setEmblemNotice(undefined);
                                setOptimisticEmblemSrc(undefined);
                                void onDeleteEmblem()
                                  .then(() =>
                                    setEmblemNotice(
                                      intl.formatMessage(messages.settingsEmblemRemoved),
                                    ),
                                  )
                                  .catch((cause: unknown) =>
                                    setError(
                                      cause instanceof Error ? cause.message : String(cause),
                                    ),
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
                        <Alert
                          dismissLabel={intl.formatMessage(messages.toastDismiss)}
                          onDismiss={() => setEmblemNotice(undefined)}
                          tone="info"
                        >
                          {emblemNotice}
                        </Alert>
                      )}
                    </div>
                    <div className="cl-tournament-settings__identity-fields">
                      <Field
                        id="settings-name"
                        label={intl.formatMessage(messages.settingsNameLabel)}
                      >
                        <Input
                          id="settings-name"
                          onChange={(event) => setName(event.target.value)}
                          value={name}
                        />
                      </Field>
                      <Field
                        id="settings-region"
                        label={intl.formatMessage(messages.settingsRegionLabel)}
                      >
                        <Input
                          id="settings-region"
                          onChange={(event) => setRegion(event.target.value)}
                          value={region}
                        />
                      </Field>
                      <Field
                        id="settings-capacity"
                        label={intl.formatMessage(messages.settingsCapacityLabel)}
                      >
                        <Input
                          id="settings-capacity"
                          onChange={(event) => setCapacity(event.target.value)}
                          type="number"
                          value={capacity}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="cl-tournament-settings__schedule-grid">
                    <Field
                      helpText={formatDateTimeInputHint(intl)}
                      id="settings-check-in-closes-at"
                      label={intl.formatMessage(messages.settingsCheckInClosesAtLabel)}
                    >
                      <Input
                        aria-describedby="settings-check-in-closes-at-help"
                        id="settings-check-in-closes-at"
                        lang={intl.locale}
                        onChange={(event) => setCheckInClosesAt(event.target.value)}
                        type="datetime-local"
                        value={checkInClosesAt}
                      />
                    </Field>
                    {/* A scheduling rule, not a ruleset override: always safe, and it moves no match. */}
                    <Field
                      helpText={intl.formatMessage(messages.settingsMinimumRestHelp)}
                      id="settings-minimum-rest"
                      label={intl.formatMessage(messages.settingsMinimumRestLabel)}
                    >
                      <Input
                        aria-describedby="settings-minimum-rest-help"
                        id="settings-minimum-rest"
                        inputMode="numeric"
                        min={0}
                        onChange={(event) => setMinimumRest(event.target.value)}
                        step={5}
                        type="number"
                        value={minimumRest}
                      />
                    </Field>
                    {/* Not a registration field and not mutation-classified: featured is
                a record flag about the public page, like the name above it. */}
                    <Label
                      className="cl-toggle cl-focusable cl-tournament-settings__featured"
                      htmlFor="settings-featured"
                    >
                      <Checkbox
                        checked={featured}
                        id="settings-featured"
                        onCheckedChange={setFeatured}
                      />
                      <span>{intl.formatMessage(messages.settingsFeaturedLabel)}</span>
                    </Label>
                  </div>
                </div>
              ) : (
                <Card
                  aria-labelledby="tournament-privacy-tab"
                  className="cl-tournament-settings__privacy-panel"
                  id="tournament-privacy-panel"
                  role="tabpanel"
                >
                  <Stack gap="4">
                    <Stack gap="2">
                      <h2 id="tournament-privacy-heading">
                        <FormattedMessage {...messages.settingsPrivacyHeading} />
                      </h2>
                      <p>{intl.formatMessage(messages.settingsPrivacyIntro)}</p>
                    </Stack>
                    <Stack gap="4">
                      <Stack gap="1">
                        <Label
                          className="cl-toggle cl-focusable"
                          htmlFor="settings-includes-minors"
                        >
                          <Checkbox
                            aria-describedby="settings-includes-minors-help"
                            checked={includesMinors}
                            id="settings-includes-minors"
                            onCheckedChange={(checked) => {
                              setIncludesMinors(checked);
                              if (!checked) setShowYouthProfiles(false);
                            }}
                          />
                          <span>{intl.formatMessage(messages.settingsIncludesMinorsLabel)}</span>
                        </Label>
                        <p id="settings-includes-minors-help">
                          {intl.formatMessage(messages.settingsIncludesMinorsHelp)}
                        </p>
                      </Stack>
                      <Stack gap="1">
                        <Label
                          className="cl-toggle cl-focusable"
                          htmlFor="settings-show-youth-profiles"
                        >
                          <Checkbox
                            aria-describedby="settings-show-youth-profiles-help"
                            checked={showYouthProfiles}
                            disabled={!includesMinors}
                            id="settings-show-youth-profiles"
                            onCheckedChange={setShowYouthProfiles}
                          />
                          <span>{intl.formatMessage(messages.settingsShowYouthProfilesLabel)}</span>
                        </Label>
                        <p id="settings-show-youth-profiles-help">
                          {intl.formatMessage(messages.settingsShowYouthProfilesHelp)}
                        </p>
                      </Stack>
                    </Stack>
                  </Stack>
                </Card>
              )}

              <SettingsActionArea
                activeTab={activeTab}
                blocked={blockedField !== undefined}
                busy={busy}
                onPreview={previewSettings}
                preview={preview}
              />

              {error !== undefined && <Alert tone="destructive">{error}</Alert>}
              {saved && (
                <Alert tone="success">
                  <FormattedMessage {...messages.settingsSaved} />
                </Alert>
              )}
            </div>
          </Form>
          {activeTab === 'settings' && (
            <TournamentSummary
              discipline={{ fieldPolicies: rulesetFieldPolicies, defaults: mergedRulesetConfig }}
              facts={{
                name: settings.name,
                region: settings.region,
                capacity: settings.capacity,
                checkInClosesAt: settings.checkInClosesAt,
                minimumRestMinutes: settings.minimumRestMinutes,
                publicRegistration: asBoolean(
                  fieldValueAt(mergedRulesetConfig, 'registration.publicOpen'),
                ),
                requiresCheckIn: asBoolean(
                  fieldValueAt(mergedRulesetConfig, 'registration.requiresCheckIn'),
                ),
              }}
              headingLevel={2}
              sections={['rules']}
            />
          )}
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
                setOptimisticEmblemSrc(`data:${output.contentType};base64,${output.contentBase64}`);
                setEmblemBusy(true);
                setEmblemNotice(undefined);
                void onUploadEmblem?.(output)
                  .then(() => setEmblemNotice(intl.formatMessage(messages.settingsEmblemUploaded)))
                  .catch((cause: unknown) => {
                    setOptimisticEmblemSrc(undefined);
                    setError(cause instanceof Error ? cause.message : String(cause));
                  })
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
