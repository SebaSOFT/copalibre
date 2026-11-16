import { EmptyState } from '../ui/molecules/empty-state.js';
import { useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl, type IntlShape } from 'react-intl';
import type { OrganizationRole } from '@copalibre/domain';
import {
  organizationEmblemUrl,
  type ControlApiClient,
  type OrganizationResponse,
  type OrganizationStorageUsageResponse,
  type StatisticsRebuildResponse,
  type UnreferencedObjectResponse,
} from '../../lib/api-client.js';
import { FramedImage } from '../FramedImage.js';
import { ImageCropModal } from '../ImageCropModal.js';
import { ClubEmblemPlaceholder } from '../placeholders.js';
import { Button } from '../ui/atoms/button.js';
import { LinkButton } from '../ui/atoms/link-button.js';
import { Card } from '../ui/atoms/card.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Form } from '../ui/atoms/form.js';
import { filePickerLabels } from '../../lib/file-picker-labels.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { Grid } from '../ui/atoms/layout/grid.js';
import { Inline } from '../ui/atoms/layout/inline.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { Field } from '../ui/molecules/field.js';
import { FieldValue } from '../ui/molecules/field-value.js';
import { FieldSet } from '../ui/molecules/field-set.js';
import { Label } from '../ui/atoms/label.js';
import { ConsequenceDialog } from '../ui/organisms/consequence-dialog.js';
import { messages as controlMessages } from '../../i18n/messages.en.js';
import {
  formatStorageBytes,
  type OrganizationSettingsDraft,
  type PatCreatedResponse,
  type PatRevocationPreview,
  type PatResponse,
} from '../pages/PreferencesPage.js';
import { PageHeaderTemplate } from './PageHeaderTemplate.js';
import { LANGUAGE_NAMES } from '../../i18n/LanguageSwitcher.js';
import { SUPPORTED_LANGUAGES } from '../../../lib/language-preference.js';
import { roleMayUse, rolesWithCapability } from '../../lib/role-access.js';
import { ROLE_LABEL } from '../../lib/role-labels.js';
import { timeZoneOptions } from '../../lib/time-zones.js';
import { Skeleton } from '../ui/atoms/skeleton.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';
import { DropZone } from '../ui/organisms/drop-zone.js';
import { UnsavedChangesBar } from '../ui/organisms/unsaved-changes-bar.js';
import {
  applyThemePreference,
  isThemePreference,
  readThemePreference,
  type ThemePreference,
} from '../../../lib/theme-preference.js';

/** The sizes the emblem renders at across the product, largest first. */
const EMBLEM_PREVIEW_SIZES = [64, 48, 32] as const;

/** The roles that hold `capability`, named in the catalogue's own words, for a "who can" line. */
function whoCan(
  intl: IntlShape,
  capability: Parameters<typeof rolesWithCapability>[0],
): { readonly roleCount: number; readonly roles: string } {
  const roles = rolesWithCapability(capability);
  return {
    roleCount: roles.length,
    roles: intl.formatList(
      roles.map((role) => intl.formatMessage(ROLE_LABEL[role])),
      { type: 'conjunction' },
    ),
  };
}

function languageName(language: string): string {
  return (LANGUAGE_NAMES as Readonly<Record<string, string>>)[language] ?? language;
}

function OrganizationIdentitySection({
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

function OrganizationStorageSection({
  canManage,
  onDeleteUnreferencedObject,
  organizationAlias,
  storageError,
  storageLoading,
  storageUsage,
  unreferencedObjects,
}: {
  readonly canManage: boolean;
  readonly onDeleteUnreferencedObject: (objectId: string) => Promise<void>;
  readonly organizationAlias: string | undefined;
  readonly storageError: string | undefined;
  readonly storageLoading: boolean;
  readonly storageUsage: OrganizationStorageUsageResponse | undefined;
  readonly unreferencedObjects: readonly UnreferencedObjectResponse[];
}): React.JSX.Element | null {
  const intl = useIntl();
  const [pendingDelete, setPendingDelete] = useState<UnreferencedObjectResponse | undefined>(
    undefined,
  );
  const [deleteBusy, setDeleteBusy] = useState(false);
  if (organizationAlias === undefined) return null;

  if (!canManage) {
    return (
      <Card
        aria-label={intl.formatMessage(controlMessages.storageUsageHeading)}
        className="cl-chamfer cl-chamfer--control cl-preferences-panel"
      >
        <h2>
          <FormattedMessage {...controlMessages.storageUsageHeading} />
        </h2>
        <p>
          <FormattedMessage {...controlMessages.storageUsageDescription} />
        </p>
        <p>
          {intl.formatMessage(
            controlMessages.orgSectionWithheld,
            whoCan(intl, 'org.manage-settings'),
          )}
        </p>
      </Card>
    );
  }

  const describeObject = (object: UnreferencedObjectResponse): Record<string, string> => ({
    contentType: object.contentType,
    size: formatStorageBytes(object.sizeBytes),
    date: new Date(object.createdAt).toLocaleDateString(intl.locale),
  });

  async function confirmDelete(): Promise<void> {
    if (pendingDelete === undefined) return;
    setDeleteBusy(true);
    try {
      await onDeleteUnreferencedObject(pendingDelete.objectId);
      setPendingDelete(undefined);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <Card
      aria-label={intl.formatMessage(controlMessages.storageUsageHeading)}
      className="cl-chamfer cl-chamfer--control cl-preferences-panel"
    >
      <h2>
        <FormattedMessage {...controlMessages.storageUsageHeading} />
      </h2>
      <p>
        <FormattedMessage {...controlMessages.storageUsageDescription} />
      </p>

      {storageLoading ? (
        <p>
          <FormattedMessage {...controlMessages.storageUsageLoading} />
        </p>
      ) : storageError ? (
        <Alert tone="destructive">{storageError}</Alert>
      ) : storageUsage !== undefined ? (
        <p className="cl-preferences-storage-summary">
          <FormattedMessage
            {...controlMessages.storageUsageSummary}
            values={{
              formattedBytes: formatStorageBytes(storageUsage.totalBytes),
              objectCount: storageUsage.objectCount,
            }}
          />
        </p>
      ) : null}

      {unreferencedObjects.length > 0 && (
        <Stack gap="2">
          <h3>
            <FormattedMessage {...controlMessages.storageUsageUnreferencedHeading} />
          </h3>
          <ul
            aria-label={intl.formatMessage(controlMessages.storageUsageUnreferencedHeading)}
            className="cl-preferences-unreferenced"
          >
            {unreferencedObjects.map((object) => (
              <li key={object.objectId} className="cl-role-user">
                <span className="cl-label">
                  {intl.formatMessage(
                    controlMessages.storageUsageObjectMeta,
                    describeObject(object),
                  )}
                </span>
                <Button
                  aria-label={intl.formatMessage(
                    controlMessages.storageUsageDeleteObjectLabel,
                    describeObject(object),
                  )}
                  onClick={() => setPendingDelete(object)}
                  type="button"
                  variant="destructive-outline"
                >
                  <FormattedMessage {...controlMessages.storageUsageDeleteObject} />
                </Button>
              </li>
            ))}
          </ul>
        </Stack>
      )}

      <ConsequenceDialog
        busy={deleteBusy}
        cancelLabel={intl.formatMessage(controlMessages.statisticsRebuildCancel)}
        closeLabel={intl.formatMessage(controlMessages.registrationModalClose)}
        confirmLabel={intl.formatMessage(controlMessages.storageUsageDeleteObject)}
        counts={[]}
        description={intl.formatMessage(
          controlMessages.storageUsageDeleteDescription,
          pendingDelete === undefined ? {} : describeObject(pendingDelete),
        )}
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setPendingDelete(undefined);
        }}
        open={pendingDelete !== undefined}
        title={intl.formatMessage(controlMessages.storageUsageDeleteTitle)}
      />
    </Card>
  );
}

function StatisticsRebuildSection({
  api,
  canRebuild,
  dismissedRebuildResult,
  onDismissRebuildResult,
  onPreviewRebuild,
  organizationAlias,
  rebuildBusy,
  rebuildResult,
  rebuildTournamentAlias,
  setRebuildTournamentAlias,
}: {
  readonly api: ControlApiClient;
  readonly canRebuild: boolean;
  readonly dismissedRebuildResult: boolean;
  readonly onDismissRebuildResult: () => void;
  readonly onPreviewRebuild: () => Promise<void>;
  readonly organizationAlias: string | undefined;
  readonly rebuildBusy: boolean;
  readonly rebuildResult: StatisticsRebuildResponse | undefined;
  readonly rebuildTournamentAlias: string;
  readonly setRebuildTournamentAlias: (alias: string) => void;
}): React.JSX.Element | null {
  const intl = useIntl();
  if (organizationAlias === undefined) return null;

  if (!canRebuild) {
    return (
      <Card
        aria-label={intl.formatMessage(controlMessages.statisticsRebuildHeading)}
        className="cl-chamfer cl-chamfer--control cl-preferences-panel"
      >
        <h2>
          <FormattedMessage {...controlMessages.statisticsRebuildHeading} />
        </h2>
        <p>
          <FormattedMessage {...controlMessages.statisticsRebuildDescription} />
        </p>
        <p>
          {intl.formatMessage(
            controlMessages.orgSectionWithheld,
            whoCan(intl, 'org.rebuild-statistics'),
          )}
        </p>
      </Card>
    );
  }

  return (
    <Card
      aria-label={intl.formatMessage(controlMessages.statisticsRebuildHeading)}
      className="cl-chamfer cl-chamfer--control cl-preferences-panel"
    >
      <h2>
        <FormattedMessage {...controlMessages.statisticsRebuildHeading} />
      </h2>
      <p>
        <FormattedMessage {...controlMessages.statisticsRebuildDescription} />
      </p>

      {rebuildResult && !dismissedRebuildResult && (
        <Alert
          dismissLabel={intl.formatMessage(controlMessages.toastDismiss)}
          onDismiss={onDismissRebuildResult}
          tone="info"
        >
          {intl.formatMessage(controlMessages.statisticsRebuildResult, {
            matches: rebuildResult.matches,
          })}
        </Alert>
      )}

      <Inline align="end" gap="4" wrap>
        <Field
          id="rebuild-tournament"
          label={intl.formatMessage(controlMessages.statisticsRebuildTournamentLabel)}
        >
          <Input
            id="rebuild-tournament"
            onChange={(event) => setRebuildTournamentAlias(event.target.value)}
            placeholder={intl.formatMessage(controlMessages.statisticsRebuildTournamentPlaceholder)}
            type="text"
            value={rebuildTournamentAlias}
          />
        </Field>
        <Button
          disabled={!api.rebuildStatistics || rebuildBusy}
          onClick={() => void onPreviewRebuild()}
          type="button"
        >
          <FormattedMessage {...controlMessages.statisticsRebuildTrigger} />
        </Button>
      </Inline>
    </Card>
  );
}

/**
 * Composes the four preference sections from the data `PreferencesPage`
 * supplies: the personal-access-token form, the
 * pending emblem crop, and the statistics-rebuild form below are this
 * component's own screen state; every mutation is a call to one of the
 * `on*` props.
 */
export function PreferencesTemplate({
  api,
  isOrganizationPage,
  loading,
  newToken,
  onChangeSettings,
  onCreatePat,
  onConfirmRevokePat,
  onDeleteUnreferencedObject,
  onRevokePat,
  onPreviewStatisticsRebuild,
  onResetSettings,
  onRunStatisticsRebuild,
  onSaveOrganizationSettings,
  onUploadOrganizationEmblem,
  organization,
  organizationAlias,
  patScopes,
  orgLoadError,
  orgLoading,
  rebuildResult,
  role,
  settingsDraft,
  storageError,
  storageLoading,
  storageUsage,
  tokens,
  unreferencedObjects,
}: {
  readonly api: ControlApiClient;
  readonly isOrganizationPage?: boolean;
  readonly loading: boolean;
  readonly newToken: PatCreatedResponse | null;
  readonly onChangeSettings: (change: Partial<OrganizationSettingsDraft>) => void;
  readonly onCreatePat: (
    label: string,
    expiresInDays: number,
    scopes: readonly string[],
  ) => Promise<boolean>;
  readonly onConfirmRevokePat: (tokenId: string) => Promise<void>;
  readonly onDeleteUnreferencedObject: (objectId: string) => Promise<void>;
  readonly onRevokePat: (tokenId: string) => Promise<PatRevocationPreview | undefined>;
  readonly onPreviewStatisticsRebuild: (
    tournamentAlias: string,
  ) => Promise<StatisticsRebuildResponse | undefined>;
  readonly onResetSettings: () => void;
  readonly onRunStatisticsRebuild: (tournamentAlias: string) => Promise<boolean>;
  readonly onSaveOrganizationSettings: () => Promise<void>;
  readonly onUploadOrganizationEmblem: (output: {
    contentBase64: string;
    contentType: 'image/png';
  }) => Promise<void>;
  readonly organization: OrganizationResponse | undefined;
  readonly organizationAlias: string | undefined;
  readonly patScopes: readonly string[];
  readonly orgLoadError: string | undefined;
  readonly orgLoading: boolean;
  readonly rebuildResult: StatisticsRebuildResponse | undefined;
  /** The signed-in role; `undefined` until it resolves, which offers everything (the server still decides). */
  readonly role: OrganizationRole | undefined;
  readonly settingsDraft: OrganizationSettingsDraft;
  readonly storageError: string | undefined;
  readonly storageLoading: boolean;
  readonly storageUsage: OrganizationStorageUsageResponse | undefined;
  readonly tokens: readonly PatResponse[];
  readonly unreferencedObjects: readonly UnreferencedObjectResponse[];
}): React.JSX.Element {
  const intl = useIntl();

  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference);
  const [label, setLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [selectedPatScopes, setSelectedPatScopes] = useState<readonly string[]>([]);
  const [pendingPatRevoke, setPendingPatRevoke] = useState<
    | {
        readonly tokenId: string;
        readonly label: string;
        readonly preview: PatRevocationPreview;
      }
    | undefined
  >(undefined);
  const [patRevokeBusy, setPatRevokeBusy] = useState(false);
  const [emblemCropSrc, setEmblemCropSrc] = useState<string | undefined>(undefined);
  const [optimisticEmblemSrc, setOptimisticEmblemSrc] = useState<string | undefined>(undefined);
  const [rebuildTournamentAlias, setRebuildTournamentAlias] = useState('');
  const [pendingRebuild, setPendingRebuild] = useState<StatisticsRebuildResponse>();
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [dismissedRebuildResult, setDismissedRebuildResult] = useState(false);

  const handleThemePreferenceChange = (value: string): void => {
    if (!isThemePreference(value)) return;
    setThemePreference(value);
    applyThemePreference(value);
  };

  const themeOptions = [
    { value: 'system', label: intl.formatMessage(controlMessages.preferencesThemeSystem) },
    { value: 'light', label: intl.formatMessage(controlMessages.preferencesThemeLight) },
    { value: 'dark', label: intl.formatMessage(controlMessages.preferencesThemeDark) },
  ];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || selectedPatScopes.length === 0) return;
    if (await onCreatePat(label, expiresInDays, selectedPatScopes)) {
      setLabel('');
      setSelectedPatScopes([]);
    }
  };

  async function previewStatisticsRebuild(): Promise<void> {
    setRebuildBusy(true);
    try {
      const preview = await onPreviewStatisticsRebuild(rebuildTournamentAlias);
      if (preview?.dryRun) setPendingRebuild(preview);
    } finally {
      setRebuildBusy(false);
    }
  }

  async function confirmStatisticsRebuild(): Promise<void> {
    if (!pendingRebuild) return;
    setRebuildBusy(true);
    setDismissedRebuildResult(false);
    try {
      if (await onRunStatisticsRebuild(rebuildTournamentAlias)) setPendingRebuild(undefined);
    } finally {
      setRebuildBusy(false);
    }
  }

  async function requestPatRevoke(tokenId: string, label: string): Promise<void> {
    const preview = await onRevokePat(tokenId);
    if (preview && !preview.reversible) setPendingPatRevoke({ tokenId, label, preview });
  }

  async function confirmPatRevocation(): Promise<void> {
    if (!pendingPatRevoke) return;
    setPatRevokeBusy(true);
    try {
      await onConfirmRevokePat(pendingPatRevoke.tokenId);
      setPendingPatRevoke(undefined);
    } catch {
      // The page reports the API error; keep the dry-run summary open for retry.
    } finally {
      setPatRevokeBusy(false);
    }
  }

  const activeTokens = tokens.filter((token) => !token.revoked);
  const formatTokenDate = (value: string): string =>
    new Date(value).toLocaleDateString(intl.locale);
  const tokenColumns: readonly DataTableColumn<PatResponse>[] = [
    {
      key: 'label',
      header: intl.formatMessage(controlMessages.preferencesPatLabel),
      label: intl.formatMessage(controlMessages.preferencesPatLabel),
      render: (token) => <strong>{token.label}</strong>,
    },
    {
      key: 'created',
      header: intl.formatMessage(controlMessages.preferencesPatCreatedColumn),
      label: intl.formatMessage(controlMessages.preferencesPatCreatedColumn),
      render: (token) => formatTokenDate(token.createdAt),
    },
    {
      key: 'expires',
      header: intl.formatMessage(controlMessages.preferencesPatExpiresColumn),
      label: intl.formatMessage(controlMessages.preferencesPatExpiresColumn),
      render: (token) => formatTokenDate(token.expiresAt),
    },
    {
      key: 'scopes',
      header: intl.formatMessage(controlMessages.preferencesPatScopes),
      label: intl.formatMessage(controlMessages.preferencesPatScopes),
      render: (token) => (
        <span className="cl-preferences-scope-label">{token.scopes.join(', ')}</span>
      ),
    },
    {
      key: 'actions',
      header: intl.formatMessage(controlMessages.rolesColumnActions),
      label: intl.formatMessage(controlMessages.rolesColumnActions),
      render: (token) => (
        <Button
          onClick={() => void requestPatRevoke(token.tokenId, token.label)}
          type="button"
          variant="destructive-outline"
        >
          <FormattedMessage {...controlMessages.preferencesPatRevoke} />
        </Button>
      ),
    },
  ];
  const canManageSettings = roleMayUse(role, 'org.manage-settings');
  const canRebuildStatistics = roleMayUse(role, 'org.rebuild-statistics');
  const themeNode = (
    <Card
      aria-label={intl.formatMessage(controlMessages.preferencesAppearanceHeading)}
      className="cl-chamfer cl-chamfer--control cl-preferences-panel"
    >
      <h2>
        <FormattedMessage {...controlMessages.preferencesAppearanceHeading} />
      </h2>
      <div className="cl-preferences-theme-select">
        <Field
          id="theme-preference"
          label={intl.formatMessage(controlMessages.preferencesThemeTitle)}
        >
          <Select
            id="theme-preference"
            onValueChange={handleThemePreferenceChange}
            options={themeOptions}
            value={themePreference}
          />
        </Field>
      </div>
    </Card>
  );
  const organizationNode = (
    <>
      <OrganizationIdentitySection
        api={api}
        canManage={canManageSettings}
        onChangeSettings={onChangeSettings}
        onResetSettings={onResetSettings}
        onSaveOrganizationSettings={onSaveOrganizationSettings}
        optimisticEmblemSrc={optimisticEmblemSrc}
        organization={organization}
        organizationAlias={organizationAlias}
        orgLoadError={orgLoadError}
        orgLoading={orgLoading}
        setEmblemCropSrc={setEmblemCropSrc}
        settingsDraft={settingsDraft}
      />

      <OrganizationStorageSection
        canManage={canManageSettings}
        onDeleteUnreferencedObject={onDeleteUnreferencedObject}
        organizationAlias={organizationAlias}
        storageError={storageError}
        storageLoading={storageLoading}
        storageUsage={storageUsage}
        unreferencedObjects={unreferencedObjects}
      />

      <StatisticsRebuildSection
        api={api}
        canRebuild={canRebuildStatistics}
        dismissedRebuildResult={dismissedRebuildResult}
        onDismissRebuildResult={() => setDismissedRebuildResult(true)}
        onPreviewRebuild={previewStatisticsRebuild}
        organizationAlias={organizationAlias}
        rebuildBusy={rebuildBusy}
        rebuildResult={rebuildResult}
        rebuildTournamentAlias={rebuildTournamentAlias}
        setRebuildTournamentAlias={setRebuildTournamentAlias}
      />
    </>
  );
  const listingNode = (
    <div className="cl-operations__listing">
      <Stack gap="0">
        {isOrganizationPage ? organizationNode : themeNode}

        <Card className="cl-chamfer cl-chamfer--control cl-preferences-panel">
          <h2>
            <FormattedMessage {...controlMessages.preferencesPatTitle} />
          </h2>
          <p>
            <FormattedMessage {...controlMessages.preferencesPatDescription} />
          </p>
          <div>
            <LinkButton
              href="/help/api-reference/"
              rel="noopener noreferrer"
              target="_blank"
              variant="secondary"
            >
              <FormattedMessage {...controlMessages.preferencesPatApiReference} />
            </LinkButton>
          </div>

          {!loading && (
            <Form
              aria-label={intl.formatMessage(controlMessages.preferencesPatTitle)}
              className="cl-preferences-pat-form"
              onSubmit={handleCreate}
            >
              <Inline align="end" gap="4" wrap>
                <Field
                  id="pat-label"
                  label={intl.formatMessage(controlMessages.preferencesPatLabel)}
                >
                  <Input
                    id="pat-label"
                    onChange={(e) => setLabel(e.target.value)}
                    required
                    type="text"
                    value={label}
                  />
                </Field>
                <Field
                  id="pat-expires"
                  label={intl.formatMessage(controlMessages.preferencesPatExpiresIn)}
                >
                  <Input
                    id="pat-expires"
                    max={365}
                    min={1}
                    onChange={(e) => setExpiresInDays(parseInt(e.target.value))}
                    required
                    className="cl-preferences-expiry-input"
                    type="number"
                    value={expiresInDays}
                  />
                </Field>
              </Inline>
              <FieldSet legend={intl.formatMessage(controlMessages.preferencesPatScopes)}>
                {patScopes.length === 0 ? (
                  <p>{intl.formatMessage(controlMessages.preferencesPatNoScopes)}</p>
                ) : (
                  <Stack gap="2">
                    {patScopes.map((scope) => (
                      <Label key={scope} className="cl-toggle cl-focusable">
                        <Checkbox
                          aria-label={scope}
                          checked={selectedPatScopes.includes(scope)}
                          id={`pat-scope-${scope}`}
                          onCheckedChange={(checked) =>
                            setSelectedPatScopes((current) =>
                              checked
                                ? [...current, scope]
                                : current.filter((selected) => selected !== scope),
                            )
                          }
                        />
                        <span className="cl-preferences-scope-label">{scope}</span>
                      </Label>
                    ))}
                  </Stack>
                )}
              </FieldSet>
              {selectedPatScopes.length === 0 && patScopes.length > 0 && (
                <p role="status">
                  {intl.formatMessage(controlMessages.preferencesPatScopesRequired)}
                </p>
              )}
              <Button disabled={!label.trim() || selectedPatScopes.length === 0} type="submit">
                <FormattedMessage {...controlMessages.preferencesPatCreate} />
              </Button>
            </Form>
          )}

          {newToken && (
            <div className="cl-preferences-token-created">
              <strong>
                <FormattedMessage {...controlMessages.preferencesPatCreated} />
              </strong>
              <code className="cl-preferences-token-created__value">{newToken.token}</code>
            </div>
          )}

          <div className="cl-preferences-token-list">
            {loading ? (
              <Skeleton
                label={intl.formatMessage(controlMessages.preferencesTokensLoading)}
                variant="block"
              />
            ) : activeTokens.length === 0 ? (
              <EmptyState
                icon="user"
                headingLevel={3}
                heading={intl.formatMessage(controlMessages.preferencesPatEmpty)}
                description={intl.formatMessage(controlMessages.interactionTokenDescription)}
                reason="informational"
              />
            ) : (
              <DataTable
                ariaLabel={intl.formatMessage(controlMessages.preferencesPatTitle)}
                columns={tokenColumns}
                mobileMode="stacked"
                rowKey={(token) => token.tokenId}
                rows={activeTokens}
              />
            )}
          </div>
        </Card>

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
              void onUploadOrganizationEmblem(output).catch(() => {
                setOptimisticEmblemSrc(undefined);
              });
            }}
          />
        )}
      </Stack>
    </div>
  );

  return (
    <>
      <PageHeaderTemplate
        description={intl.formatMessage(
          isOrganizationPage
            ? controlMessages.orgPageDescription
            : controlMessages.preferencesDescription,
        )}
        title={intl.formatMessage(
          isOrganizationPage ? controlMessages.navOrganization : controlMessages.preferencesTitle,
        )}
      >
        {listingNode}
      </PageHeaderTemplate>
      <ConsequenceDialog
        open={pendingRebuild !== undefined}
        onOpenChange={(open) => {
          if (!open && !rebuildBusy) setPendingRebuild(undefined);
        }}
        title={intl.formatMessage(controlMessages.statisticsRebuildHeading)}
        description={intl.formatMessage(controlMessages.statisticsRebuildConsequences, {
          matches: pendingRebuild?.matches ?? 0,
          figures: pendingRebuild?.figures ?? 0,
        })}
        counts={[
          {
            label: intl.formatMessage(controlMessages.statisticsRebuildMatches),
            value: pendingRebuild?.matches ?? 0,
          },
          {
            label: intl.formatMessage(controlMessages.statisticsRebuildFigures),
            value: pendingRebuild?.figures ?? 0,
          },
        ]}
        confirmLabel={intl.formatMessage(controlMessages.statisticsRebuildTrigger)}
        cancelLabel={intl.formatMessage(controlMessages.statisticsRebuildCancel)}
        closeLabel={intl.formatMessage(controlMessages.registrationModalClose)}
        busy={rebuildBusy}
        onConfirm={() => void confirmStatisticsRebuild()}
      />
      <ConsequenceDialog
        open={pendingPatRevoke !== undefined}
        onOpenChange={(open) => {
          if (!open && !patRevokeBusy) setPendingPatRevoke(undefined);
        }}
        title={intl.formatMessage(controlMessages.preferencesPatRevocationTitle, {
          label: pendingPatRevoke?.label ?? '',
        })}
        description={intl.formatMessage(controlMessages.preferencesPatRevocationDescription)}
        counts={[
          {
            label: intl.formatMessage(controlMessages.preferencesPatRevocationCount),
            value: pendingPatRevoke?.preview.tokens ?? 0,
          },
        ]}
        confirmLabel={intl.formatMessage(controlMessages.preferencesPatRevoke)}
        cancelLabel={intl.formatMessage(controlMessages.statisticsRebuildCancel)}
        closeLabel={intl.formatMessage(controlMessages.registrationModalClose)}
        busy={patRevokeBusy}
        onConfirm={() => void confirmPatRevocation()}
      />
    </>
  );
}
