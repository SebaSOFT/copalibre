import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { CreateOrganizationRequest } from '@copalibre/contracts';
import {
  createControlApiClient,
  type ControlApiClient,
  type InstalledModuleResponse,
  type ModuleVerifyResultResponse,
  type OutdatedModuleResponse,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';

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

  return (
    <div style={pageStyle}>
      <header>
        <span style={eyebrowStyle}>
          <FormattedMessage {...messages.platformSectionLabel} />
        </span>
        <h1 style={titleStyle}>
          <FormattedMessage {...messages.platformTitle} />
        </h1>
        <p style={descriptionStyle}>
          <FormattedMessage {...messages.platformDescription} />
        </p>
      </header>

      <section style={panelStyle} aria-labelledby="platform-organization-heading">
        <h2 id="platform-organization-heading">
          <FormattedMessage {...messages.platformOrganizationHeading} />
        </h2>
        <p style={descriptionStyle}>
          <FormattedMessage {...messages.platformOrganizationDescription} />
        </p>
        {!bootstrapAlias ? (
          <form onSubmit={(event) => void submitOrganization(event)} style={formGridStyle}>
            <Field label={intl.formatMessage(messages.platformOrganizationAlias)}>
              <input
                required
                value={organization.alias}
                onChange={(event) =>
                  setOrganization((current) => ({ ...current, alias: event.target.value }))
                }
              />
            </Field>
            <Field label={intl.formatMessage(messages.platformOrganizationName)}>
              <input
                required
                value={organization.name}
                onChange={(event) =>
                  setOrganization((current) => ({ ...current, name: event.target.value }))
                }
              />
            </Field>
            <Field label={intl.formatMessage(messages.platformPrimaryLanguage)}>
              <select
                value={organization.primaryLanguage}
                onChange={(event) =>
                  setOrganization((current) => ({
                    ...current,
                    primaryLanguage: event.target
                      .value as CreateOrganizationRequest['primaryLanguage'],
                  }))
                }
              >
                {LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={intl.formatMessage(messages.platformTimezone)}>
              <input
                required
                value={organization.timezone}
                onChange={(event) =>
                  setOrganization((current) => ({ ...current, timezone: event.target.value }))
                }
              />
            </Field>
            <button disabled={busy === 'organization'} type="submit" style={primaryButtonStyle}>
              <FormattedMessage {...messages.platformCreateOrganization} />
            </button>
          </form>
        ) : (
          <form onSubmit={(event) => void submitInvitation(event)} style={formGridStyle}>
            <p>
              <FormattedMessage
                {...messages.platformOrganizationReady}
                values={{ alias: bootstrapAlias }}
              />
            </p>
            <Field label={intl.formatMessage(messages.platformFirstAdminEmail)}>
              <input
                required
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
              />
            </Field>
            <Field label={intl.formatMessage(messages.platformFirstAdminRole)}>
              <input readOnly value="admin" />
            </Field>
            <button disabled={busy === 'invitation'} type="submit" style={primaryButtonStyle}>
              <FormattedMessage {...messages.platformInviteAdministrator} />
            </button>
          </form>
        )}
      </section>

      <section style={panelStyle} aria-labelledby="platform-modules-heading">
        <div style={sectionHeaderStyle}>
          <div>
            <h2 id="platform-modules-heading">
              <FormattedMessage {...messages.platformModulesHeading} />
            </h2>
            <p style={descriptionStyle}>
              <FormattedMessage {...messages.platformModulesDescription} />
            </p>
          </div>
          <button
            disabled={busy === 'outdated'}
            onClick={() => void checkOutdated()}
            type="button"
            style={secondaryButtonStyle}
          >
            <FormattedMessage {...messages.platformCheckUpdates} />
          </button>
        </div>
        {outdated.length > 0 && (
          <ul
            aria-label={intl.formatMessage(messages.platformUpdatesAvailable)}
            style={updateListStyle}
          >
            {outdated.map((entry) => (
              <li key={entry.alias}>
                <strong>{entry.alias}</strong>: {entry.currentVersion} → {entry.latestVersion} (
                {entry.upgrade})
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(event) => void submitModule(event)} style={formGridStyle}>
          <Field label={intl.formatMessage(messages.platformModuleAlias)}>
            <input required value={alias} onChange={(event) => setAlias(event.target.value)} />
          </Field>
          <Field label={intl.formatMessage(messages.platformVersionRange)}>
            <input
              placeholder="^1.0.0"
              value={range}
              onChange={(event) => setRange(event.target.value)}
            />
          </Field>
          <Field label={intl.formatMessage(messages.platformAlternateSource)}>
            <input
              placeholder="file:///…"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
          </Field>
          <button disabled={busy === 'install'} type="submit" style={primaryButtonStyle}>
            <FormattedMessage {...messages.platformInstallModule} />
          </button>
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
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th>
                    <FormattedMessage {...messages.platformKind} />
                  </th>
                  <th>
                    <FormattedMessage {...messages.platformModuleAlias} />
                  </th>
                  <th>
                    <FormattedMessage {...messages.platformVersion} />
                  </th>
                  <th>
                    <FormattedMessage {...messages.platformSourceKind} />
                  </th>
                  <th>
                    <FormattedMessage {...messages.platformAuthor} />
                  </th>
                  <th>
                    <FormattedMessage {...messages.platformActions} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {modules.map((module_) => {
                  const result = verification.find(
                    (entry) => entry.alias === module_.alias && entry.version === module_.version,
                  );
                  return (
                    <tr key={module_.moduleId}>
                      <td>{module_.kind}</td>
                      <td>
                        <strong>{module_.alias}</strong>
                      </td>
                      <td>{module_.version}</td>
                      <td>{module_.sourceKind}</td>
                      <td>{module_.attributionAuthor}</td>
                      <td>
                        <div style={actionsStyle}>
                          <button
                            disabled={busy !== undefined}
                            onClick={() => void verify(module_.alias)}
                            type="button"
                            style={secondaryButtonStyle}
                          >
                            <FormattedMessage {...messages.platformVerify} />
                          </button>
                          <button
                            disabled={busy !== undefined}
                            onClick={() => void remove(module_.alias)}
                            type="button"
                            style={dangerButtonStyle}
                          >
                            <FormattedMessage {...messages.platformRemove} />
                          </button>
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactElement;
}): React.JSX.Element {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      {children}
    </label>
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

const pageStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-6)',
  maxWidth: 1180,
};
const eyebrowStyle: React.CSSProperties = {
  color: 'var(--cl-state-live)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
  textTransform: 'uppercase',
};
const titleStyle: React.CSSProperties = { margin: 'var(--cl-space-2) 0' };
const descriptionStyle: React.CSSProperties = { color: 'var(--cl-text-secondary)', maxWidth: 760 };
const panelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-4)',
  padding: 'var(--cl-space-5)',
  border: '1px solid var(--cl-border-muted)',
  background: 'var(--cl-surface-panel)',
};
const formGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 'var(--cl-space-4)',
  alignItems: 'end',
};
const fieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-2)',
  color: 'var(--cl-text-secondary)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
};
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--cl-space-4)',
  alignItems: 'start',
  flexWrap: 'wrap',
};
const primaryButtonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: 'var(--cl-space-3) var(--cl-space-4)',
  border: 0,
  background: 'var(--cl-state-live)',
  color: 'var(--cl-surface-base)',
  fontFamily: 'var(--cl-font-mono)',
  cursor: 'pointer',
};
const secondaryButtonStyle: React.CSSProperties = {
  minHeight: 36,
  padding: 'var(--cl-space-2) var(--cl-space-3)',
  border: '1px solid var(--cl-border-strong)',
  background: 'transparent',
  color: 'var(--cl-text-primary)',
  cursor: 'pointer',
};
const dangerButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  borderColor: 'var(--cl-state-negative)',
  color: 'var(--cl-state-negative)',
};
const updateListStyle: React.CSSProperties = {
  margin: 0,
  padding: 'var(--cl-space-4)',
  listStylePosition: 'inside',
  border: '1px solid var(--cl-state-warning)',
  color: 'var(--cl-text-secondary)',
};
const tableWrapStyle: React.CSSProperties = { overflowX: 'auto' };
const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
};
const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  alignItems: 'center',
};
