import { EmptyState } from '../ui/molecules/empty-state.js';
import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
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
import { Card } from '../ui/atoms/card.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Form } from '../ui/atoms/form.js';
import { filePickerLabels } from '../../lib/file-picker-labels.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { Inline } from '../ui/atoms/layout/inline.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { Field } from '../ui/molecules/field.js';
import { FieldSet } from '../ui/molecules/field-set.js';
import { Label } from '../ui/atoms/label.js';
import { ConsequenceDialog } from '../ui/organisms/consequence-dialog.js';
import { messages as controlMessages } from '../../i18n/messages.en.js';
import {
  formatStorageBytes,
  type PatCreatedResponse,
  type PatRevocationPreview,
  type PatResponse,
} from '../pages/PreferencesPage.js';
import { PageHeaderTemplate } from './PageHeaderTemplate.js';
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

function OrganizationIdentitySection({
  api,
  onChangeOrgName,
  onSaveOrganizationName,
  optimisticEmblemSrc,
  organization,
  organizationAlias,
  orgLoadError,
  orgLoading,
  orgName,
  setEmblemCropSrc,
}: {
  readonly api: ControlApiClient;
  readonly onChangeOrgName: (name: string) => void;
  readonly onSaveOrganizationName: () => Promise<void>;
  readonly optimisticEmblemSrc: string | undefined;
  readonly organization: OrganizationResponse | undefined;
  readonly organizationAlias: string | undefined;
  readonly orgLoadError: string | undefined;
  readonly orgLoading: boolean;
  readonly orgName: string;
  readonly setEmblemCropSrc: (source: string | undefined) => void;
}): React.JSX.Element | null {
  const intl = useIntl();
  if (organizationAlias === undefined) return null;
  const emblemSrc =
    optimisticEmblemSrc ??
    (organization?.emblemObjectId !== undefined
      ? organizationEmblemUrl(organizationAlias)
      : undefined);

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
      ) : (
        <Stack gap="4">
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

          {api.uploadOrganizationEmblem && (
            <DropZone
              accept="image/*"
              aria-label={intl.formatMessage(controlMessages.orgIdentityUploadEmblem)}
              id="org-emblem-upload"
              instruction={intl.formatMessage(controlMessages.orgIdentityDropInstruction)}
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
              void onSaveOrganizationName();
            }}
          >
            <Field id="org-name" label={intl.formatMessage(controlMessages.orgIdentityName)}>
              <Input
                id="org-name"
                onChange={(event) => onChangeOrgName(event.target.value)}
                type="text"
                value={orgName}
              />
            </Field>
            <UnsavedChangesBar
              changedFields={[
                { id: 'name', label: intl.formatMessage(controlMessages.orgIdentityName) },
              ]}
              dirty={organization !== undefined && orgName !== organization.name}
              fieldsLabel={intl.formatMessage(controlMessages.unsavedChangesFields)}
              onReset={() => onChangeOrgName(organization?.name ?? '')}
              onSave={() => void onSaveOrganizationName()}
              resetLabel={intl.formatMessage(controlMessages.unsavedChangesReset)}
              saveLabel={intl.formatMessage(controlMessages.orgIdentitySave)}
              summary={intl.formatMessage(controlMessages.unsavedChangesSummary, { count: 1 })}
            />
          </Form>
        </Stack>
      )}
    </Card>
  );
}

function OrganizationStorageSection({
  onDeleteUnreferencedObject,
  organizationAlias,
  storageError,
  storageLoading,
  storageUsage,
  unreferencedObjects,
}: {
  readonly onDeleteUnreferencedObject: (objectId: string) => Promise<void>;
  readonly organizationAlias: string | undefined;
  readonly storageError: string | undefined;
  readonly storageLoading: boolean;
  readonly storageUsage: OrganizationStorageUsageResponse | undefined;
  readonly unreferencedObjects: readonly UnreferencedObjectResponse[];
}): React.JSX.Element | null {
  const intl = useIntl();
  if (organizationAlias === undefined) return null;

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
        <ul aria-label={intl.formatMessage(controlMessages.storageUsageUnreferencedHeading)}>
          {unreferencedObjects.map((object) => (
            <li key={object.objectId} className="cl-role-user">
              <span>{formatStorageBytes(object.sizeBytes)}</span>
              <span className="cl-label">{object.contentType}</span>
              <Button
                onClick={() => void onDeleteUnreferencedObject(object.objectId)}
                type="button"
                variant="destructive-outline"
              >
                <FormattedMessage {...controlMessages.storageUsageDeleteObject} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatisticsRebuildSection({
  api,
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
  onChangeOrgName,
  onCreatePat,
  onConfirmRevokePat,
  onDeleteUnreferencedObject,
  onRevokePat,
  onPreviewStatisticsRebuild,
  onRunStatisticsRebuild,
  onSaveOrganizationName,
  onUploadOrganizationEmblem,
  organization,
  organizationAlias,
  patScopes,
  orgLoadError,
  orgLoading,
  orgName,
  rebuildResult,
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
  readonly onChangeOrgName: (name: string) => void;
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
  readonly onRunStatisticsRebuild: (tournamentAlias: string) => Promise<boolean>;
  readonly onSaveOrganizationName: () => Promise<void>;
  readonly onUploadOrganizationEmblem: (output: {
    contentBase64: string;
    contentType: 'image/png';
  }) => Promise<void>;
  readonly organization: OrganizationResponse | undefined;
  readonly organizationAlias: string | undefined;
  readonly patScopes: readonly string[];
  readonly orgLoadError: string | undefined;
  readonly orgLoading: boolean;
  readonly orgName: string;
  readonly rebuildResult: StatisticsRebuildResponse | undefined;
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
      render: (token) => <strong>{token.label}</strong>,
    },
    {
      key: 'created',
      header: intl.formatMessage(controlMessages.preferencesPatCreatedColumn),
      render: (token) => formatTokenDate(token.createdAt),
    },
    {
      key: 'expires',
      header: intl.formatMessage(controlMessages.preferencesPatExpiresColumn),
      render: (token) => formatTokenDate(token.expiresAt),
    },
    {
      key: 'scopes',
      header: intl.formatMessage(controlMessages.preferencesPatScopes),
      render: (token) => (
        <span className="cl-preferences-scope-label">{token.scopes.join(', ')}</span>
      ),
    },
    {
      key: 'actions',
      header: intl.formatMessage(controlMessages.rolesColumnActions),
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
  const listingNode = (
    <div className="cl-operations__listing">
      <Stack gap="0">
        <Card
          aria-label={intl.formatMessage(controlMessages.preferencesThemeTitle)}
          className="cl-chamfer cl-chamfer--control cl-preferences-panel"
        >
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
        </Card>

        <OrganizationIdentitySection
          api={api}
          onChangeOrgName={onChangeOrgName}
          onSaveOrganizationName={onSaveOrganizationName}
          optimisticEmblemSrc={optimisticEmblemSrc}
          organization={organization}
          organizationAlias={organizationAlias}
          orgLoadError={orgLoadError}
          orgLoading={orgLoading}
          orgName={orgName}
          setEmblemCropSrc={setEmblemCropSrc}
        />

        <OrganizationStorageSection
          onDeleteUnreferencedObject={onDeleteUnreferencedObject}
          organizationAlias={organizationAlias}
          storageError={storageError}
          storageLoading={storageLoading}
          storageUsage={storageUsage}
          unreferencedObjects={unreferencedObjects}
        />

        <StatisticsRebuildSection
          api={api}
          dismissedRebuildResult={dismissedRebuildResult}
          onDismissRebuildResult={() => setDismissedRebuildResult(true)}
          onPreviewRebuild={previewStatisticsRebuild}
          organizationAlias={organizationAlias}
          rebuildBusy={rebuildBusy}
          rebuildResult={rebuildResult}
          rebuildTournamentAlias={rebuildTournamentAlias}
          setRebuildTournamentAlias={setRebuildTournamentAlias}
        />

        <Card className="cl-chamfer cl-chamfer--control cl-preferences-panel">
          <h2>
            <FormattedMessage {...controlMessages.preferencesPatTitle} />
          </h2>
          <p>
            <FormattedMessage {...controlMessages.preferencesPatDescription} />
          </p>

          <Form
            aria-label={intl.formatMessage(controlMessages.preferencesPatTitle)}
            className="cl-preferences-pat-form"
            onSubmit={handleCreate}
          >
            <Inline align="end" gap="4" wrap>
              <Field id="pat-label" label={intl.formatMessage(controlMessages.preferencesPatLabel)}>
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
              <p>
                <FormattedMessage {...controlMessages.preferencesTokensLoading} />
              </p>
            ) : activeTokens.length === 0 ? (
              <EmptyState
                icon="user"
                headingLevel={3}
                heading={intl.formatMessage(controlMessages.preferencesPatEmpty)}
                description={intl.formatMessage(controlMessages.interactionTokenDescription)}
                action={{
                  label: intl.formatMessage(controlMessages.interactionCreateToken),
                  onClick: () => document.getElementById('pat-label')?.focus(),
                }}
              />
            ) : (
              <DataTable
                ariaLabel={intl.formatMessage(controlMessages.preferencesPatTitle)}
                columns={tokenColumns}
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
