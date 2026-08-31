import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { CreateOrganizationRequest } from '@copalibre/contracts';
import {
  createControlApiClient,
  type AuthoredModuleRequest,
  type AuthoredModuleValidationFailureResponse,
  type ControlApiClient,
  type InstalledModuleResponse,
  type InstallationSuperAdminResponse,
  type ModuleVerifyResultResponse,
  type OutdatedModuleResponse,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';
import { RolesPermissionsRoute } from './RolesPermissionsRoute.js';
import { DescriptorBuilderWizard } from './DescriptorBuilderWizard.js';
import { ProfileBuilderWizard } from './ProfileBuilderWizard.js';
import type { DisciplineOption } from '../lib/wizard.js';
import { Button } from './ui/atoms/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/atoms/card.js';
import { Input } from './ui/atoms/input.js';
import { ListScreenTemplate } from './ui/templates/list-screen-template.js';
import { DataTable, type DataTableColumn } from './ui/organisms/data-table.js';
import { FormField } from './ui/molecules/form-field.js';

const LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de', 'ru', 'zh'] as const;

export function PlatformAdministrationRoute({
  client,
}: {
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const intl = useIntl();
  const toast = useToast();
  const [modules, setModules] = useState<readonly InstalledModuleResponse[]>([]);
  const [outdated, setOutdated] = useState<readonly OutdatedModuleResponse[]>([]);
  const [verification, setVerification] = useState<readonly ModuleVerifyResultResponse[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [alias, setAlias] = useState('');
  const [range, setRange] = useState('');
  const [source, setSource] = useState('');
  const [organization, setOrganization] = useState<CreateOrganizationRequest>({
    alias: '',
    name: '',
    primaryLanguage: 'es',
    timezone: 'America/Argentina/San_Juan',
  });
  const [adminEmail, setAdminEmail] = useState('');
  const [bootstrapAlias, setBootstrapAlias] = useState<string>();
  const [superAdmins, setSuperAdmins] = useState<readonly InstallationSuperAdminResponse[]>([]);
  const [loadingSuperAdmins, setLoadingSuperAdmins] = useState(true);
  const [newSuperAdminPrincipalId, setNewSuperAdminPrincipalId] = useState('');
  const [manageOrgAlias, setManageOrgAlias] = useState('');
  const [managingOrgAlias, setManagingOrgAlias] = useState<string>();
  const [authoringDiscipline, setAuthoringDiscipline] = useState(false);
  const [authoringProfile, setAuthoringProfile] = useState(false);
  const [authoringBusy, setAuthoringBusy] = useState(false);
  const [authoringFailures, setAuthoringFailures] = useState<
    readonly AuthoredModuleValidationFailureResponse[]
  >([]);
  const [disciplineOptions, setDisciplineOptions] = useState<readonly DisciplineOption[]>([]);

  useEffect(() => {
    let active = true;
    void api
      .listDisciplines()
      .then((result) => {
        if (active) setDisciplineOptions(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api]);

  const loadSuperAdmins = useCallback(async () => {
    setLoadingSuperAdmins(true);
    try {
      setSuperAdmins(
        await requireApi(api.listInstallationSuperAdmins, 'listInstallationSuperAdmins')(),
      );
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setLoadingSuperAdmins(false);
    }
  }, [api, toast]);

  useEffect(() => {
    let active = true;
    void requireApi(api.listInstallationSuperAdmins, 'listInstallationSuperAdmins')()
      .then((result) => {
        if (active) setSuperAdmins(result);
      })
      .catch((cause: unknown) => {
        if (active) pushVerbatimError(toast, cause);
      })
      .finally(() => {
        if (active) setLoadingSuperAdmins(false);
      });
    return () => {
      active = false;
    };
  }, [api, toast]);

  const submitSuperAdmin = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy('super-admin');
    try {
      await requireApi(
        api.createInstallationSuperAdmin,
        'createInstallationSuperAdmin',
      )({ principalId: newSuperAdminPrincipalId.trim() });
      setNewSuperAdminPrincipalId('');
      await loadSuperAdmins();
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setBusy(undefined);
    }
  };

  const removeSuperAdmin = async (assignmentId: string): Promise<void> => {
    setBusy(`super-admin-remove:${assignmentId}`);
    try {
      await requireApi(
        api.deleteInstallationSuperAdmin,
        'deleteInstallationSuperAdmin',
      )(assignmentId);
      await loadSuperAdmins();
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setBusy(undefined);
    }
  };

  const fetchModules = useCallback(async () => {
    const list = requireApi(api.listInstalledModules, 'listInstalledModules');
    return list();
  }, [api]);

  const loadModules = useCallback(async () => {
    setLoadingModules(true);
    try {
      setModules(await fetchModules());
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setLoadingModules(false);
    }
  }, [fetchModules, toast]);

  useEffect(() => {
    let active = true;
    void fetchModules()
      .then((result) => {
        if (active) setModules(result);
      })
      .catch((cause: unknown) => {
        if (active) pushVerbatimError(toast, cause);
      })
      .finally(() => {
        if (active) setLoadingModules(false);
      });
    return () => {
      active = false;
    };
  }, [fetchModules, toast]);

  const submitOrganization = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy('organization');
    try {
      const created = await requireApi(
        api.createOrganization,
        'createOrganization',
      )({
        ...organization,
        alias: organization.alias.trim(),
        name: organization.name.trim(),
        timezone: organization.timezone?.trim(),
      });
      setBootstrapAlias(created.alias);
      toast.push({
        severity: 'info',
        message: intl.formatMessage(messages.platformOrganizationReady, {
          alias: created.alias,
        }),
      });
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setBusy(undefined);
    }
  };

  const submitInvitation = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!bootstrapAlias) return;
    setBusy('invitation');
    try {
      await api.inviteOrganizationUser(bootstrapAlias, {
        email: adminEmail.trim(),
        role: 'admin',
        status: 'active',
      });
      toast.push({
        severity: 'success',
        message: intl.formatMessage(messages.platformOrganizationCreated, {
          alias: bootstrapAlias,
        }),
      });
      setOrganization({
        alias: '',
        name: '',
        primaryLanguage: 'es',
        timezone: 'America/Argentina/San_Juan',
      });
      setAdminEmail('');
      setBootstrapAlias(undefined);
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setBusy(undefined);
    }
  };

  const submitModule = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const oneShotSource = source.trim();
    setSource('');
    setBusy('install');
    try {
      const installed = await requireApi(
        api.installModule,
        'installModule',
      )({
        alias: alias.trim(),
        allowUnsatisfiedCapabilities: false,
        ...(range.trim() ? { range: range.trim() } : {}),
        ...(oneShotSource ? { source: oneShotSource } : {}),
      });
      toast.push({
        severity: 'success',
        message: intl.formatMessage(messages.platformModuleInstalled, {
          alias: installed.alias,
          version: installed.version,
        }),
      });
      setAlias('');
      setRange('');
      await loadModules();
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setBusy(undefined);
    }
  };

  const remove = async (moduleAlias: string): Promise<void> => {
    if (!window.confirm(intl.formatMessage(messages.platformRemoveConfirm, { alias: moduleAlias })))
      return;
    setBusy(`remove:${moduleAlias}`);
    try {
      await requireApi(api.removeModule, 'removeModule')(moduleAlias);
      toast.push({
        severity: 'success',
        message: intl.formatMessage(messages.platformModuleRemoved, { alias: moduleAlias }),
      });
      await loadModules();
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setBusy(undefined);
    }
  };

  const verify = async (moduleAlias: string): Promise<void> => {
    setBusy(`verify:${moduleAlias}`);
    try {
      const results = await requireApi(api.verifyModules, 'verifyModules')();
      setVerification(results);
      const result = results.find((entry) => entry.alias === moduleAlias);
      toast.push({
        severity: result?.ok ? 'success' : 'error',
        message: result?.ok
          ? intl.formatMessage(messages.platformVerificationPassed, { alias: moduleAlias })
          : (result?.failures.map((failure) => failure.message).join('; ') ??
            intl.formatMessage(messages.platformVerificationFailed, { alias: moduleAlias })),
      });
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setBusy(undefined);
    }
  };

  const checkOutdated = async (): Promise<void> => {
    setBusy('outdated');
    try {
      setOutdated(await requireApi(api.listOutdatedModules, 'listOutdatedModules')());
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setBusy(undefined);
    }
  };

  const authorModule = async (
    request: AuthoredModuleRequest,
    onInstalled: () => void,
  ): Promise<void> => {
    setAuthoringBusy(true);
    setAuthoringFailures([]);
    try {
      const validated = await requireApi(
        api.validateAuthoredModule,
        'validateAuthoredModule',
      )(request);
      if (!validated.ok) {
        setAuthoringFailures(validated.failures);
        return;
      }
      const installed = await requireApi(
        api.installAuthoredModule,
        'installAuthoredModule',
      )(request);
      toast.push({
        severity: 'success',
        message: intl.formatMessage(messages.platformModuleInstalled, {
          alias: installed.alias,
          version: installed.version,
        }),
      });
      onInstalled();
      await loadModules();
      if (installed.kind === 'discipline') {
        await api
          .listDisciplines()
          .then(setDisciplineOptions)
          .catch(() => {});
      }
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setAuthoringBusy(false);
    }
  };

  const contributeModule = async (module_: InstalledModuleResponse): Promise<void> => {
    setBusy(`contribute:${module_.alias}`);
    try {
      const result = await requireApi(
        api.submitAuthoredModule,
        'submitAuthoredModule',
      )({ kind: module_.kind, alias: module_.alias, version: module_.version });
      toast.push({
        severity: 'success',
        message: intl.formatMessage(messages.platformModuleContributed, {
          url: result.pullRequestUrl,
        }),
      });
    } catch (cause) {
      pushVerbatimError(toast, cause);
    } finally {
      setBusy(undefined);
    }
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
              onClick={() => void verify(module_.alias)}
              type="button"
              variant="secondary"
            >
              <FormattedMessage {...messages.platformVerify} />
            </Button>
            <Button
              disabled={busy !== undefined}
              onClick={() => void remove(module_.alias)}
              type="button"
              variant="destructive-outline"
            >
              <FormattedMessage {...messages.platformRemove} />
            </Button>
            {module_.sourceKind === 'authored' && (
              <Button
                disabled={busy !== undefined}
                onClick={() => void contributeModule(module_)}
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
    <ListScreenTemplate
      breadcrumb={<FormattedMessage {...messages.platformSectionLabel} />}
      listing={
        <div className="cl-platform-sections">
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
                <form
                  className="cl-platform-form-grid"
                  onSubmit={(event) => void submitOrganization(event)}
                >
                  <FormField
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
                  </FormField>
                  <FormField
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
                  </FormField>
                  <FormField
                    id="platform-org-language"
                    label={intl.formatMessage(messages.platformPrimaryLanguage)}
                  >
                    <select
                      className="cl-select cl-select--default cl-focusable"
                      id="platform-org-language"
                      onChange={(event) =>
                        setOrganization((current) => ({
                          ...current,
                          primaryLanguage: event.target
                            .value as CreateOrganizationRequest['primaryLanguage'],
                        }))
                      }
                      value={organization.primaryLanguage}
                    >
                      {LANGUAGES.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
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
                  </FormField>
                  <Button disabled={busy === 'organization'} type="submit">
                    <FormattedMessage {...messages.platformCreateOrganization} />
                  </Button>
                </form>
              ) : (
                <form
                  className="cl-platform-form-grid"
                  onSubmit={(event) => void submitInvitation(event)}
                >
                  <p>
                    <FormattedMessage
                      {...messages.platformOrganizationReady}
                      values={{ alias: bootstrapAlias }}
                    />
                  </p>
                  <FormField
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
                  </FormField>
                  <FormField
                    id="platform-admin-role"
                    label={intl.formatMessage(messages.platformFirstAdminRole)}
                  >
                    <Input id="platform-admin-role" readOnly value="admin" />
                  </FormField>
                  <Button disabled={busy === 'invitation'} type="submit">
                    <FormattedMessage {...messages.platformInviteAdministrator} />
                  </Button>
                </form>
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
                <FormField
                  id="platform-manage-org-alias"
                  label={intl.formatMessage(messages.platformManageOrganizationAlias)}
                >
                  <Input
                    id="platform-manage-org-alias"
                    onChange={(event) => setManageOrgAlias(event.target.value)}
                    value={manageOrgAlias}
                  />
                </FormField>
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
                    <RolesPermissionsRoute client={api} organizationAlias={managingOrgAlias} />
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
                        onClick={() => void removeSuperAdmin(row.assignmentId)}
                        type="button"
                        variant="destructive-outline"
                      >
                        <FormattedMessage {...messages.platformRemove} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="cl-platform-form-grid"
                onSubmit={(event) => void submitSuperAdmin(event)}
              >
                <FormField
                  id="platform-super-admin-principal"
                  label={intl.formatMessage(messages.platformSuperAdminPrincipalId)}
                >
                  <Input
                    id="platform-super-admin-principal"
                    onChange={(event) => setNewSuperAdminPrincipalId(event.target.value)}
                    required
                    value={newSuperAdminPrincipalId}
                  />
                </FormField>
                <Button disabled={busy === 'super-admin'} type="submit">
                  <FormattedMessage {...messages.platformCreateSuperAdmin} />
                </Button>
              </form>
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
              <div style={{ display: 'flex', gap: 'var(--cl-space-3)' }}>
                <Button
                  disabled={busy === 'outdated'}
                  onClick={() => void checkOutdated()}
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
                  onSubmit={(request) =>
                    void authorModule(request, () => setAuthoringDiscipline(false))
                  }
                />
              )}
              {authoringProfile && (
                <ProfileBuilderWizard
                  busy={authoringBusy}
                  disciplines={disciplineOptions}
                  failures={authoringFailures}
                  onSubmit={(request) =>
                    void authorModule(request, () => setAuthoringProfile(false))
                  }
                />
              )}
              {outdated.length > 0 && (
                <ul
                  aria-label={intl.formatMessage(messages.platformUpdatesAvailable)}
                  className="cl-platform-update-list"
                >
                  {outdated.map((entry) => (
                    <li key={entry.alias}>
                      <strong>{entry.alias}</strong>: {entry.currentVersion} → {entry.latestVersion}{' '}
                      ({entry.upgrade})
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="cl-platform-form-grid"
                onSubmit={(event) => void submitModule(event)}
              >
                <FormField
                  id="platform-module-alias"
                  label={intl.formatMessage(messages.platformModuleAlias)}
                >
                  <Input
                    id="platform-module-alias"
                    onChange={(event) => setAlias(event.target.value)}
                    required
                    value={alias}
                  />
                </FormField>
                <FormField
                  id="platform-module-range"
                  label={intl.formatMessage(messages.platformVersionRange)}
                >
                  <Input
                    id="platform-module-range"
                    onChange={(event) => setRange(event.target.value)}
                    placeholder="^1.0.0"
                    value={range}
                  />
                </FormField>
                <FormField
                  id="platform-module-source"
                  label={intl.formatMessage(messages.platformAlternateSource)}
                >
                  <Input
                    id="platform-module-source"
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="file:///…"
                    value={source}
                  />
                </FormField>
                <Button disabled={busy === 'install'} type="submit">
                  <FormattedMessage {...messages.platformInstallModule} />
                </Button>
              </form>

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

function requireApi<T>(method: T | undefined, name: string): NonNullable<T> {
  if (!method) throw new Error(`Control API client does not implement ${name}`);
  return method as NonNullable<T>;
}

function pushVerbatimError(toast: ReturnType<typeof useToast>, cause: unknown): void {
  toast.push({
    severity: 'error',
    message: cause instanceof Error ? cause.message : String(cause),
  });
}
