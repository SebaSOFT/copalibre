import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { CreateOrganizationRequest } from '@copalibre/contracts';
import type {
  AuthoredModuleRequest,
  AuthoredModuleValidationFailureResponse,
  ControlApiClient,
  InstalledModuleResponse,
  InstallationSuperAdminResponse,
  ModuleVerifyResultResponse,
  OutdatedModuleResponse,
} from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { RolesPermissionsPage } from '../pages/RolesPermissionsPage.js';
import { DescriptorBuilderWizard } from '../DescriptorBuilderWizard.js';
import { ProfileBuilderWizard } from '../ProfileBuilderWizard.js';
import type { DisciplineOption } from '../../lib/wizard.js';
import { Button } from '../ui/atoms/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/atoms/card.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';
import { Form } from '../ui/atoms/form.js';
import { EditorialCard } from '../ui/molecules/editorial-card.js';
import { Field } from '../ui/molecules/field.js';

const LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'] as const;

const EMPTY_ORGANIZATION: CreateOrganizationRequest = {
  alias: '',
  name: '',
  primaryLanguage: 'es',
  timezone: 'America/Argentina/San_Juan',
};

/**
 * Composes the screen from data and callbacks `PlatformAdministrationPage`
 * supplies (openspec 0225 task 6.1): every form field, wizard toggle and the
 * "which organization am I managing" flow state below is this component's
 * own screen state; every actual mutation is a call to one of the `on*`
 * props.
 */
export function PlatformAdministrationTemplate({
  api,
  authoringBusy,
  authoringFailures,
  busy,
  disciplineOptions,
  loadingModules,
  loadingSuperAdmins,
  modules,
  onAuthorModule,
  onCheckOutdated,
  onContributeModule,
  onCreateOrganization,
  onCreateSuperAdmin,
  onInstallModule,
  onInviteAdmin,
  onRemoveModule,
  onRemoveSuperAdmin,
  onVerifyModule,
  outdated,
  superAdmins,
  verification,
}: {
  readonly api: ControlApiClient;
  readonly authoringBusy: boolean;
  readonly authoringFailures: readonly AuthoredModuleValidationFailureResponse[];
  readonly busy: string | undefined;
  readonly disciplineOptions: readonly DisciplineOption[];
  readonly loadingModules: boolean;
  readonly loadingSuperAdmins: boolean;
  readonly modules: readonly InstalledModuleResponse[];
  readonly onAuthorModule: (request: AuthoredModuleRequest) => Promise<boolean>;
  readonly onCheckOutdated: () => Promise<void>;
  readonly onContributeModule: (module_: InstalledModuleResponse) => Promise<void>;
  readonly onCreateOrganization: (
    request: CreateOrganizationRequest,
  ) => Promise<string | undefined>;
  readonly onCreateSuperAdmin: (principalId: string) => Promise<boolean>;
  readonly onInstallModule: (aliasValue: string, range: string, source: string) => Promise<boolean>;
  readonly onInviteAdmin: (alias: string, email: string) => Promise<boolean>;
  readonly onRemoveModule: (moduleAlias: string) => Promise<void>;
  readonly onRemoveSuperAdmin: (assignmentId: string) => Promise<void>;
  readonly onVerifyModule: (moduleAlias: string) => Promise<void>;
  readonly outdated: readonly OutdatedModuleResponse[];
  readonly superAdmins: readonly InstallationSuperAdminResponse[];
  readonly verification: readonly ModuleVerifyResultResponse[];
}): React.JSX.Element {
  const intl = useIntl();
  const [alias, setAlias] = useState('');
  const [range, setRange] = useState('');
  const [source, setSource] = useState('');
  const [organization, setOrganization] = useState<CreateOrganizationRequest>(EMPTY_ORGANIZATION);
  const [adminEmail, setAdminEmail] = useState('');
  const [bootstrapAlias, setBootstrapAlias] = useState<string>();
  const [newSuperAdminPrincipalId, setNewSuperAdminPrincipalId] = useState('');
  const [manageOrgAlias, setManageOrgAlias] = useState('');
  const [managingOrgAlias, setManagingOrgAlias] = useState<string>();
  const [authoringDiscipline, setAuthoringDiscipline] = useState(false);
  const [authoringProfile, setAuthoringProfile] = useState(false);

  const submitOrganization = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const createdAlias = await onCreateOrganization(organization);
    if (createdAlias) setBootstrapAlias(createdAlias);
  };

  const submitInvitation = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!bootstrapAlias) return;
    const succeeded = await onInviteAdmin(bootstrapAlias, adminEmail);
    if (succeeded) {
      setOrganization(EMPTY_ORGANIZATION);
      setAdminEmail('');
      setBootstrapAlias(undefined);
    }
  };

  const submitSuperAdmin = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const succeeded = await onCreateSuperAdmin(newSuperAdminPrincipalId);
    if (succeeded) setNewSuperAdminPrincipalId('');
  };

  const submitModule = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const oneShotSource = source;
    setSource('');
    const succeeded = await onInstallModule(alias, range, oneShotSource);
    if (succeeded) {
      setAlias('');
      setRange('');
    }
  };

  const removeModule = async (moduleAlias: string): Promise<void> => {
    if (!window.confirm(intl.formatMessage(messages.platformRemoveConfirm, { alias: moduleAlias })))
      return;
    await onRemoveModule(moduleAlias);
  };

  const submitDiscipline = async (request: AuthoredModuleRequest): Promise<void> => {
    if (await onAuthorModule(request)) setAuthoringDiscipline(false);
  };

  const submitProfile = async (request: AuthoredModuleRequest): Promise<void> => {
    if (await onAuthorModule(request)) setAuthoringProfile(false);
  };

  const moduleColumns: readonly DataTableColumn<InstalledModuleResponse>[] = [
    { key: 'kind', header: <FormattedMessage {...messages.platformKind} />, render: (m) => m.kind },
    {
      key: 'alias',
      header: <FormattedMessage {...messages.platformModuleAlias} />,
      render: (m) => <strong>{m.alias}</strong>,
    },
    {
      key: 'version',
      header: <FormattedMessage {...messages.platformVersion} />,
      render: (m) => m.version,
    },
    {
      key: 'sourceKind',
      header: <FormattedMessage {...messages.platformSourceKind} />,
      render: (m) => m.sourceKind,
    },
    {
      key: 'author',
      header: <FormattedMessage {...messages.platformAuthor} />,
      render: (m) => m.attributionAuthor,
    },
    {
      key: 'actions',
      header: <FormattedMessage {...messages.platformActions} />,
      render: (module_) => {
        const result = verification.find(
          (entry) => entry.alias === module_.alias && entry.version === module_.version,
        );
        return (
          <div className="cl-role-status">
            <Button
              disabled={busy !== undefined}
              onClick={() => void onVerifyModule(module_.alias)}
              type="button"
              variant="secondary"
            >
              <FormattedMessage {...messages.platformVerify} />
            </Button>
            <Button
              disabled={busy !== undefined}
              onClick={() => void removeModule(module_.alias)}
              type="button"
              variant="destructive-outline"
            >
              <FormattedMessage {...messages.platformRemove} />
            </Button>
            {module_.sourceKind === 'authored' && (
              <Button
                disabled={busy !== undefined}
                onClick={() => void onContributeModule(module_)}
                type="button"
                variant="secondary"
              >
                <FormattedMessage {...messages.platformContribute} />
              </Button>
            )}
            {result && (
              <span
                aria-label={
                  result.ok
                    ? intl.formatMessage(messages.platformVerified)
                    : intl.formatMessage(messages.platformVerificationFailed, {
                        alias: module_.alias,
                      })
                }
              >
                {result.ok ? '✓' : '!'}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <ListScreenLayout
      breadcrumb={<FormattedMessage {...messages.platformSectionLabel} />}
      listing={
        <div className="cl-screen-sections">
          <Card aria-labelledby="platform-organization-heading" role="region">
            <CardHeader>
              <CardTitle id="platform-organization-heading">
                <FormattedMessage {...messages.platformOrganizationHeading} />
              </CardTitle>
              <CardDescription>
                <FormattedMessage {...messages.platformOrganizationDescription} />
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!bootstrapAlias ? (
                <Form
                  className="cl-platform-form-grid"
                  onSubmit={(event) => void submitOrganization(event)}
                >
                  <Field
                    id="platform-org-alias"
                    label={intl.formatMessage(messages.platformOrganizationAlias)}
                  >
                    <Input
                      id="platform-org-alias"
                      onChange={(event) =>
                        setOrganization((current) => ({ ...current, alias: event.target.value }))
                      }
                      required
                      value={organization.alias}
                    />
                  </Field>
                  <Field
                    id="platform-org-name"
                    label={intl.formatMessage(messages.platformOrganizationName)}
                  >
                    <Input
                      id="platform-org-name"
                      onChange={(event) =>
                        setOrganization((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                      value={organization.name}
                    />
                  </Field>
                  <Field
                    id="platform-org-language"
                    label={intl.formatMessage(messages.platformPrimaryLanguage)}
                  >
                    <Select
                      id="platform-org-language"
                      onValueChange={(val) =>
                        setOrganization((current) => ({
                          ...current,
                          primaryLanguage: val as CreateOrganizationRequest['primaryLanguage'],
                        }))
                      }
                      options={LANGUAGES.map((language) => ({
                        value: language,
                        label: language,
                      }))}
                      value={organization.primaryLanguage ?? 'es'}
                    />
                  </Field>
                  <Field
                    id="platform-org-timezone"
                    label={intl.formatMessage(messages.platformTimezone)}
                  >
                    <Input
                      id="platform-org-timezone"
                      onChange={(event) =>
                        setOrganization((current) => ({ ...current, timezone: event.target.value }))
                      }
                      required
                      value={organization.timezone}
                    />
                  </Field>
                  <Button disabled={busy === 'organization'} type="submit">
                    <FormattedMessage {...messages.platformCreateOrganization} />
                  </Button>
                </Form>
              ) : (
                <Form
                  className="cl-platform-form-grid"
                  onSubmit={(event) => void submitInvitation(event)}
                >
                  <p>
                    <FormattedMessage
                      {...messages.platformOrganizationReady}
                      values={{ alias: bootstrapAlias }}
                    />
                  </p>
                  <Field
                    id="platform-admin-email"
                    label={intl.formatMessage(messages.platformFirstAdminEmail)}
                  >
                    <Input
                      id="platform-admin-email"
                      onChange={(event) => setAdminEmail(event.target.value)}
                      required
                      type="email"
                      value={adminEmail}
                    />
                  </Field>
                  <Field
                    id="platform-admin-role"
                    label={intl.formatMessage(messages.platformFirstAdminRole)}
                  >
                    <Input id="platform-admin-role" readOnly value="admin" />
                  </Field>
                  <Button disabled={busy === 'invitation'} type="submit">
                    <FormattedMessage {...messages.platformInviteAdministrator} />
                  </Button>
                </Form>
              )}
            </CardContent>
          </Card>

          <Card aria-labelledby="platform-users-heading" role="region">
            <CardHeader>
              <CardTitle id="platform-users-heading">
                <FormattedMessage {...messages.platformUsersHeading} />
              </CardTitle>
              <CardDescription>
                <FormattedMessage {...messages.platformUsersDescription} />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="cl-platform-form-grid">
                <Field
                  id="platform-manage-org-alias"
                  label={intl.formatMessage(messages.platformManageOrganizationAlias)}
                >
                  <Input
                    id="platform-manage-org-alias"
                    onChange={(event) => setManageOrgAlias(event.target.value)}
                    value={manageOrgAlias}
                  />
                </Field>
                <Button
                  disabled={!manageOrgAlias.trim()}
                  onClick={() => setManagingOrgAlias(manageOrgAlias.trim())}
                  type="button"
                  variant="secondary"
                >
                  <FormattedMessage {...messages.platformManageOrganizationUsers} />
                </Button>
              </div>
              {managingOrgAlias ? (
                <Card>
                  <CardContent>
                    <RolesPermissionsPage client={api} organizationAlias={managingOrgAlias} />
                  </CardContent>
                </Card>
              ) : null}

              <h3>
                <FormattedMessage {...messages.platformSuperAdminsHeading} />
              </h3>
              {loadingSuperAdmins ? (
                <p>
                  <FormattedMessage {...messages.platformLoadingModules} />
                </p>
              ) : superAdmins.length === 0 ? (
                <p>
                  <FormattedMessage {...messages.platformNoSuperAdmins} />
                </p>
              ) : (
                <ul className="cl-platform-update-list">
                  {superAdmins.map((row) => (
                    <li key={row.assignmentId}>
                      {row.principalId} — {row.status}{' '}
                      <Button
                        disabled={busy !== undefined}
                        onClick={() => void onRemoveSuperAdmin(row.assignmentId)}
                        type="button"
                        variant="destructive-outline"
                      >
                        <FormattedMessage {...messages.platformRemove} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Form
                className="cl-platform-form-grid"
                onSubmit={(event) => void submitSuperAdmin(event)}
              >
                <Field
                  id="platform-super-admin-principal"
                  label={intl.formatMessage(messages.platformSuperAdminPrincipalId)}
                >
                  <Input
                    id="platform-super-admin-principal"
                    onChange={(event) => setNewSuperAdminPrincipalId(event.target.value)}
                    required
                    value={newSuperAdminPrincipalId}
                  />
                </Field>
                <Button disabled={busy === 'super-admin'} type="submit">
                  <FormattedMessage {...messages.platformCreateSuperAdmin} />
                </Button>
              </Form>
            </CardContent>
          </Card>

          <Card aria-labelledby="platform-modules-heading" role="region">
            <CardHeader className="cl-platform-modules-header">
              <div>
                <CardTitle id="platform-modules-heading">
                  <FormattedMessage {...messages.platformModulesHeading} />
                </CardTitle>
                <CardDescription>
                  <FormattedMessage {...messages.platformModulesDescription} />
                </CardDescription>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--cl-space-3)' }}>
                <Button
                  disabled={busy === 'outdated'}
                  onClick={() => void onCheckOutdated()}
                  type="button"
                  variant="secondary"
                >
                  <FormattedMessage {...messages.platformCheckUpdates} />
                </Button>
                <Button
                  onClick={() => setAuthoringDiscipline((current) => !current)}
                  type="button"
                  variant="secondary"
                >
                  <FormattedMessage {...messages.platformAuthorDiscipline} />
                </Button>
                <Button
                  onClick={() => setAuthoringProfile((current) => !current)}
                  type="button"
                  variant="secondary"
                >
                  <FormattedMessage {...messages.platformAuthorProfile} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {authoringDiscipline && (
                <DescriptorBuilderWizard
                  busy={authoringBusy}
                  failures={authoringFailures}
                  onSubmit={(request) => void submitDiscipline(request)}
                />
              )}
              {authoringProfile && (
                <ProfileBuilderWizard
                  busy={authoringBusy}
                  disciplines={disciplineOptions}
                  failures={authoringFailures}
                  onSubmit={(request) => void submitProfile(request)}
                />
              )}
              {/*
                The updates this screen already fetched, read as writing rather
                than as a bare list. Every value below comes from
                `listOutdatedModules`; nothing is a release note this file made
                up, and no listing, feed or subscription was added to show them.
              */}
              {outdated.length > 0 && (
                <div
                  aria-label={intl.formatMessage(messages.platformUpdatesAvailable)}
                  className="cl-editorial-list"
                  role="group"
                >
                  {outdated.map((entry) => (
                    <EditorialCard
                      callout={{
                        title: intl.formatMessage(messages.platformUpdateCalloutTitle),
                        description: intl.formatMessage(messages.platformUpdateCalloutDescription),
                      }}
                      dateline={intl.formatMessage(messages.platformUpdateKind, {
                        upgrade: entry.upgrade,
                      })}
                      eyebrow={intl.formatMessage(messages.platformUpdateEyebrow)}
                      key={entry.alias}
                      title={intl.formatMessage(messages.platformUpdateHeadline, {
                        alias: entry.alias,
                        currentVersion: entry.currentVersion,
                        latestVersion: entry.latestVersion,
                      })}
                    />
                  ))}
                </div>
              )}
              <Form
                className="cl-platform-form-grid"
                onSubmit={(event) => void submitModule(event)}
              >
                <Field
                  id="platform-module-alias"
                  label={intl.formatMessage(messages.platformModuleAlias)}
                >
                  <Input
                    id="platform-module-alias"
                    onChange={(event) => setAlias(event.target.value)}
                    required
                    value={alias}
                  />
                </Field>
                <Field
                  id="platform-module-range"
                  label={intl.formatMessage(messages.platformVersionRange)}
                >
                  <Input
                    id="platform-module-range"
                    onChange={(event) => setRange(event.target.value)}
                    placeholder="^1.0.0"
                    value={range}
                  />
                </Field>
                <Field
                  id="platform-module-source"
                  label={intl.formatMessage(messages.platformAlternateSource)}
                >
                  <Input
                    id="platform-module-source"
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="file:///…"
                    value={source}
                  />
                </Field>
                <Button disabled={busy === 'install'} type="submit">
                  <FormattedMessage {...messages.platformInstallModule} />
                </Button>
              </Form>

              {loadingModules ? (
                <p>
                  <FormattedMessage {...messages.platformLoadingModules} />
                </p>
              ) : modules.length === 0 ? (
                <p>
                  <FormattedMessage {...messages.platformNoModules} />
                </p>
              ) : (
                <DataTable columns={moduleColumns} rowKey={(m) => m.moduleId} rows={modules} />
              )}
            </CardContent>
          </Card>
        </div>
      }
      title={<FormattedMessage {...messages.platformTitle} />}
    />
  );
}
