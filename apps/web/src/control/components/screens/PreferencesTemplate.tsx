import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, defineMessages, useIntl } from 'react-intl';
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
import { FilePicker } from '../ui/atoms/file-picker.js';
import { Input } from '../ui/atoms/input.js';
import { Inline } from '../ui/atoms/layout/inline.js';
import { Stack } from '../ui/atoms/layout/stack.js';
import { Field } from '../ui/molecules/field.js';
import { messages as controlMessages } from '../../i18n/messages.en.js';
import {
  formatStorageBytes,
  type PatCreatedResponse,
  type PatResponse,
} from '../pages/PreferencesPage.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

const messages = defineMessages({
  title: {
    id: 'preferences.title',
    defaultMessage: 'Personal Preferences',
  },
  patTitle: {
    id: 'preferences.patTitle',
    defaultMessage: 'Personal Access Tokens',
  },
  patDescription: {
    id: 'preferences.patDescription',
    defaultMessage: 'Generate tokens to access the API directly. Tokens are only shown once.',
  },
  createPat: {
    id: 'preferences.createPat',
    defaultMessage: 'Generate Token',
  },
  patLabel: {
    id: 'preferences.patLabel',
    defaultMessage: 'Token Label',
  },
  patExpiresIn: {
    id: 'preferences.patExpiresIn',
    defaultMessage: 'Expires in (days)',
  },
  patCreated: {
    id: 'preferences.patCreated',
    defaultMessage: 'Token created. Copy it now:',
  },
  revokePat: {
    id: 'preferences.revokePat',
    defaultMessage: 'Revoke',
  },
  noTokens: {
    id: 'preferences.noTokens',
    defaultMessage: 'No active personal access tokens.',
  },
});

const preferencesSectionPadding = 'clamp(var(--cl-space-3), 4vw, var(--cl-space-6))';

/**
 * Composes the four preference sections from the data `PreferencesPage`
 * supplies (openspec 0225 task 6.2): the personal-access-token form, the
 * pending emblem crop, and the statistics-rebuild form below are this
 * component's own screen state; every mutation is a call to one of the
 * `on*` props.
 */
export function PreferencesTemplate({
  api,
  loading,
  newToken,
  onChangeOrgName,
  onCreatePat,
  onDeleteUnreferencedObject,
  onRevokePat,
  onRunStatisticsRebuild,
  onSaveOrganizationName,
  onUploadOrganizationEmblem,
  organization,
  organizationAlias,
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
  readonly loading: boolean;
  readonly newToken: PatCreatedResponse | null;
  readonly onChangeOrgName: (name: string) => void;
  readonly onCreatePat: (label: string, expiresInDays: number) => Promise<boolean>;
  readonly onDeleteUnreferencedObject: (objectId: string) => Promise<void>;
  readonly onRevokePat: (tokenId: string) => Promise<void>;
  readonly onRunStatisticsRebuild: (tournamentAlias: string) => Promise<void>;
  readonly onSaveOrganizationName: () => Promise<void>;
  readonly onUploadOrganizationEmblem: (output: {
    contentBase64: string;
    contentType: 'image/png';
  }) => Promise<void>;
  readonly organization: OrganizationResponse | undefined;
  readonly organizationAlias: string | undefined;
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

  const [label, setLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [emblemCropSrc, setEmblemCropSrc] = useState<string | undefined>(undefined);
  const [rebuildTournamentAlias, setRebuildTournamentAlias] = useState('');
  const [rebuildConfirming, setRebuildConfirming] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    if (await onCreatePat(label, expiresInDays)) setLabel('');
  };

  async function runStatisticsRebuild(): Promise<void> {
    await onRunStatisticsRebuild(rebuildTournamentAlias);
    setRebuildConfirming(false);
  }

  const listingNode = (
    <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
      <Card
        className="cl-chamfer cl-chamfer--control"
        style={{
          marginTop: '2rem',
          padding: preferencesSectionPadding,
        }}
      >
        <h2>
          <FormattedMessage {...messages.patTitle} />
        </h2>
        <p>
          <FormattedMessage {...messages.patDescription} />
        </p>

        <form
          onSubmit={handleCreate}
          style={{
            display: 'flex',
            gap: '1rem',
            marginTop: '1rem',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <Field id="pat-label" label={intl.formatMessage(messages.patLabel)}>
            <Input
              id="pat-label"
              onChange={(e) => setLabel(e.target.value)}
              required
              type="text"
              value={label}
            />
          </Field>
          <Field id="pat-expires" label={intl.formatMessage(messages.patExpiresIn)}>
            <Input
              id="pat-expires"
              max={365}
              min={1}
              onChange={(e) => setExpiresInDays(parseInt(e.target.value))}
              required
              style={{ width: '80px' }}
              type="number"
              value={expiresInDays}
            />
          </Field>
          <Button disabled={!label.trim()} type="submit">
            <FormattedMessage {...messages.createPat} />
          </Button>
        </form>

        {newToken && (
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1rem',
              border: '1px solid var(--cl-state-live)',
              background: 'var(--cl-surface-base)',
            }}
          >
            <strong>
              <FormattedMessage {...messages.patCreated} />
            </strong>
            <code
              style={{
                display: 'block',
                padding: '1rem',
                backgroundColor: 'var(--c-surface-sunken)',
                borderRadius: '0.25rem',
                marginTop: '0.5rem',
                wordBreak: 'break-all',
              }}
            >
              {newToken.token}
            </code>
          </div>
        )}

        <div style={{ marginTop: '2rem' }}>
          {loading ? (
            <p>
              <FormattedMessage {...controlMessages.preferencesTokensLoading} />
            </p>
          ) : tokens.length === 0 ? (
            <p>
              <FormattedMessage {...messages.noTokens} />
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {tokens
                .filter((t) => !t.revoked)
                .map((token) => (
                  <li
                    key={token.tokenId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '1rem',
                      borderBottom: '1px solid var(--cl-border-muted)',
                    }}
                  >
                    <div>
                      <strong>{token.label}</strong>
                      <div
                        style={{
                          fontSize: 'var(--cl-font-size-sm)',
                          color: 'var(--cl-text-secondary)',
                          marginTop: '0.25rem',
                        }}
                      >
                        Expira: {new Date(token.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      onClick={() => void onRevokePat(token.tokenId)}
                      type="button"
                      variant="destructive-outline"
                    >
                      <FormattedMessage {...messages.revokePat} />
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </Card>

      {organizationAlias !== undefined && (
        <Card
          aria-label={intl.formatMessage(controlMessages.orgIdentityHeading)}
          className="cl-chamfer cl-chamfer--control"
          style={{
            marginTop: '2rem',
            padding: preferencesSectionPadding,
          }}
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
              <FramedImage
                key={organization?.emblemObjectId ?? 'none'}
                alt={intl.formatMessage(controlMessages.orgIdentityEmblemAlt)}
                placeholder={
                  <ClubEmblemPlaceholder
                    size={64}
                    title={intl.formatMessage(controlMessages.orgIdentityEmblemPlaceholderAlt)}
                  />
                }
                size={64}
                src={
                  organization?.emblemObjectId !== undefined
                    ? organizationEmblemUrl(organizationAlias)
                    : undefined
                }
              />

              {api.uploadOrganizationEmblem && (
                <FilePicker
                  accept="image/*"
                  aria-label={intl.formatMessage(controlMessages.orgIdentityUploadEmblem)}
                  id="org-emblem-upload"
                  label={intl.formatMessage(controlMessages.orgIdentityUploadEmblem)}
                  onChange={(files) => {
                    const file = files?.[0];
                    if (file) setEmblemCropSrc(URL.createObjectURL(file));
                  }}
                />
              )}

              <Inline align="end" gap="4" wrap>
                <Field id="org-name" label={intl.formatMessage(controlMessages.orgIdentityName)}>
                  <Input
                    id="org-name"
                    onChange={(event) => onChangeOrgName(event.target.value)}
                    type="text"
                    value={orgName}
                  />
                </Field>
                <Button onClick={() => void onSaveOrganizationName()} type="button">
                  <FormattedMessage {...controlMessages.orgIdentitySave} />
                </Button>
              </Inline>
            </Stack>
          )}
        </Card>
      )}

      {organizationAlias !== undefined && (
        <Card
          aria-label={intl.formatMessage(controlMessages.statisticsRebuildHeading)}
          className="cl-chamfer cl-chamfer--control"
          style={{
            marginTop: '2rem',
            padding: preferencesSectionPadding,
          }}
        >
          <h2>
            <FormattedMessage {...controlMessages.statisticsRebuildHeading} />
          </h2>
          <p>
            <FormattedMessage {...controlMessages.statisticsRebuildDescription} />
          </p>

          {rebuildResult && (
            <Alert tone="info">
              {intl.formatMessage(controlMessages.statisticsRebuildResult, {
                matches: rebuildResult.matches,
              })}
            </Alert>
          )}

          <div
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-end',
              marginTop: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <Field
              id="rebuild-tournament"
              label={intl.formatMessage(controlMessages.statisticsRebuildTournamentLabel)}
            >
              <Input
                id="rebuild-tournament"
                onChange={(event) => setRebuildTournamentAlias(event.target.value)}
                placeholder={intl.formatMessage(
                  controlMessages.statisticsRebuildTournamentPlaceholder,
                )}
                type="text"
                value={rebuildTournamentAlias}
              />
            </Field>
            {!rebuildConfirming ? (
              <Button
                disabled={!api.rebuildStatistics}
                onClick={() => setRebuildConfirming(true)}
                type="button"
              >
                <FormattedMessage {...controlMessages.statisticsRebuildTrigger} />
              </Button>
            ) : (
              <>
                <Button onClick={() => void runStatisticsRebuild()} type="button">
                  <FormattedMessage {...controlMessages.statisticsRebuildConfirm} />
                </Button>
                <Button
                  onClick={() => setRebuildConfirming(false)}
                  type="button"
                  variant="secondary"
                >
                  <FormattedMessage {...controlMessages.statisticsRebuildCancel} />
                </Button>
              </>
            )}
          </div>
          {rebuildConfirming && (
            <Alert tone="destructive">
              <FormattedMessage {...controlMessages.statisticsRebuildConfirmPrompt} />
            </Alert>
          )}
        </Card>
      )}

      {organizationAlias !== undefined && (
        <Card
          aria-label={intl.formatMessage(controlMessages.storageUsageHeading)}
          className="cl-chamfer cl-chamfer--control"
          style={{
            marginTop: '2rem',
            padding: preferencesSectionPadding,
          }}
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
            <p style={{ marginTop: '1rem', fontWeight: 600 }}>
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
            void onUploadOrganizationEmblem(output);
          }}
        />
      )}
    </div>
  );

  return <ListScreenLayout listing={listingNode} title={intl.formatMessage(messages.title)} />;
}
