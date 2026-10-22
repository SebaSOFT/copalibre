import type { CreateOrganizationRequest } from '@copalibre/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type AuthoredModuleRequest,
  type AuthoredModuleValidationFailureResponse,
  type ControlApiClient,
  type InstalledModuleResponse,
  type ModuleVerifyResultResponse,
  type OutdatedModuleResponse,
} from '../../lib/api-client.js';
import type { DisciplineOption } from '../../lib/wizard.js';
import { controlTokenStore } from '../../session/token-store.js';
import { PlatformAdministrationTemplate } from '../screens/PlatformAdministrationTemplate.js';
import { useToast } from '../ToastProvider.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * Fetches and mutates: every call into the API
 * client lives here, `PlatformAdministrationTemplate` composes the screen
 * from the resulting data and the callbacks below.
 *
 * Unlike most other page/template splits in this surface, the outcome
 * toasts stay here rather than in the template: each one is built from a
 * value the API response itself carries (a created alias, an installed
 * module's version, a pull request URL) — the page "supplies catalogues"
 * role the tier table names, not screen composition.
 */
export function PlatformAdministrationPage({
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
  const [activeTab, setActiveTab] = useState<'overview' | 'diagnostics'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'diagnostics') return 'diagnostics';
    }
    return 'overview';
  });
  const diagnosticsRead = useResilientRead(
    'control-platform-diagnostics',
    () => api.getDiagnosticsSummary?.() ?? Promise.resolve(undefined),
    { thing: intl.formatMessage(messages.platformTitle), enabled: activeTab === 'diagnostics' },
  );
  const diagnosticsSummary = diagnosticsRead.data;
  const diagnosticsLoading =
    diagnosticsRead.status === 'loading' || diagnosticsRead.status === 'failed-empty';
  const diagnosticsError = undefined;
  const refreshDiagnostics = diagnosticsRead.refresh;
  const loadDiagnostics = useCallback(async (): Promise<void> => {
    await refreshDiagnostics();
  }, [refreshDiagnostics]);
  const [autoPoll, setAutoPoll] = useState(false);
  const [retryingOutbox, setRetryingOutbox] = useState(false);

  const [outdated, setOutdated] = useState<readonly OutdatedModuleResponse[]>([]);
  const [verification, setVerification] = useState<readonly ModuleVerifyResultResponse[]>([]);
  const [busy, setBusy] = useState<string>();
  const [authoringBusy, setAuthoringBusy] = useState(false);
  const [authoringFailures, setAuthoringFailures] = useState<
    readonly AuthoredModuleValidationFailureResponse[]
  >([]);
  const read = useResilientRead(
    'control-platform-overview',
    async () => {
      const [modules, superAdmins, disciplineOptions] = await Promise.all([
        requireApi(api.listInstalledModules, 'listInstalledModules')(),
        requireApi(api.listInstallationSuperAdmins, 'listInstallationSuperAdmins')(),
        api.listDisciplines?.() ?? Promise.resolve([]),
      ]);
      return { modules, superAdmins, disciplineOptions };
    },
    {
      thing: intl.formatMessage(messages.platformTitle),
      isEmpty: (data) => data.modules.length === 0 && data.superAdmins.length === 0,
    },
  );
  const { modules = [], superAdmins = [], disciplineOptions = [] } = read.data ?? {};
  const setDisciplineOptions = (disciplineOptions: readonly DisciplineOption[]): void =>
    read.update((current) => ({ ...current, disciplineOptions }));
  const loadModules = read.retry;
  const loadSuperAdmins = read.retry;
  const loadingModules = read.data === undefined;
  const loadingSuperAdmins = read.data === undefined;

  const createSuperAdmin = async (principalId: string): Promise<boolean> => {
    setBusy('super-admin');
    try {
      await requireApi(
        api.createInstallationSuperAdmin,
        'createInstallationSuperAdmin',
      )({ principalId: principalId.trim() });
      await loadSuperAdmins();
      return true;
    } catch (cause) {
      pushVerbatimError(toast, cause);
      return false;
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

  const createOrganization = async (
    request: CreateOrganizationRequest,
  ): Promise<string | undefined> => {
    setBusy('organization');
    try {
      const created = await requireApi(
        api.createOrganization,
        'createOrganization',
      )({
        ...request,
        alias: request.alias.trim(),
        name: request.name.trim(),
        timezone: request.timezone?.trim(),
      });
      toast.push({
        severity: 'info',
        message: intl.formatMessage(messages.platformOrganizationReady, {
          alias: created.alias,
        }),
      });
      return created.alias;
    } catch (cause) {
      pushVerbatimError(toast, cause);
      return undefined;
    } finally {
      setBusy(undefined);
    }
  };

  const inviteOrganizationAdmin = async (alias: string, email: string): Promise<boolean> => {
    setBusy('invitation');
    try {
      await api.inviteOrganizationUser(alias, {
        email: email.trim(),
        role: 'admin',
        status: 'active',
      });
      toast.push({
        severity: 'success',
        message: intl.formatMessage(messages.platformOrganizationCreated, { alias }),
      });
      return true;
    } catch (cause) {
      pushVerbatimError(toast, cause);
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const installModule = async (
    aliasValue: string,
    range: string,
    source: string,
  ): Promise<boolean> => {
    setBusy('install');
    try {
      const installed = await requireApi(
        api.installModule,
        'installModule',
      )({
        alias: aliasValue.trim(),
        allowUnsatisfiedCapabilities: false,
        ...(range.trim() ? { range: range.trim() } : {}),
        ...(source.trim() ? { source: source.trim() } : {}),
      });
      toast.push({
        severity: 'success',
        message: intl.formatMessage(messages.platformModuleInstalled, {
          alias: installed.alias,
          version: installed.version,
        }),
      });
      await loadModules();
      return true;
    } catch (cause) {
      pushVerbatimError(toast, cause);
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const removeModule = async (moduleAlias: string): Promise<void> => {
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

  const verifyModule = async (moduleAlias: string): Promise<void> => {
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

  const authorModule = async (request: AuthoredModuleRequest): Promise<boolean> => {
    setAuthoringBusy(true);
    setAuthoringFailures([]);
    try {
      const validated = await requireApi(
        api.validateAuthoredModule,
        'validateAuthoredModule',
      )(request);
      if (!validated.ok) {
        setAuthoringFailures(validated.failures);
        return false;
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
      await loadModules();
      if (installed.kind === 'discipline') {
        await api
          .listDisciplines()
          .then(setDisciplineOptions)
          .catch(() => {});
      }
      return true;
    } catch (cause) {
      pushVerbatimError(toast, cause);
      return false;
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

  useEffect(() => {
    const updateTab = () => {
      const params = new URLSearchParams(window.location.search);
      const isDiag = params.get('tab') === 'diagnostics';
      setActiveTab(isDiag ? 'diagnostics' : 'overview');
    };
    window.addEventListener('popstate', updateTab);
    window.addEventListener('copalibre:control-navigated', updateTab);
    return () => {
      window.removeEventListener('popstate', updateTab);
      window.removeEventListener('copalibre:control-navigated', updateTab);
    };
  }, []);

  useEffect(() => {
    if (!autoPoll || activeTab !== 'diagnostics') return;
    const interval = setInterval(() => {
      void loadDiagnostics();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoPoll, activeTab, loadDiagnostics]);

  const selectTab = useCallback((tab: 'overview' | 'diagnostics') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'diagnostics') {
        url.searchParams.set('tab', 'diagnostics');
      } else {
        url.searchParams.delete('tab');
      }
      window.history.pushState({}, '', url.pathname + url.search);
    }
  }, []);

  const retryOutboxEvents = useCallback(
    async (eventIds: readonly string[]) => {
      setRetryingOutbox(true);
      try {
        const retryFn = requireApi(api.retryOutboxEvents, 'retryOutboxEvents');
        const response = await retryFn({ eventIds: [...eventIds] });
        toast.push({
          severity: 'success',
          message: intl.formatMessage(messages.platformDiagnosticsRetrySuccess, {
            count: response.retried.length,
            skipped: response.skipped.length,
          }),
        });
        await loadDiagnostics();
      } catch (cause) {
        pushVerbatimError(toast, cause);
      } finally {
        setRetryingOutbox(false);
      }
    },
    [api, intl, loadDiagnostics, toast],
  );

  return (
    <ReadState
      {...(activeTab === 'diagnostics' ? diagnosticsRead : read)}
      title={intl.formatMessage(messages.platformTitle)}
    >
      <PlatformAdministrationTemplate
        activeTab={activeTab}
        api={api}
        authoringBusy={authoringBusy}
        authoringFailures={authoringFailures}
        autoPoll={autoPoll}
        busy={busy}
        diagnosticsError={diagnosticsError}
        diagnosticsLoading={diagnosticsLoading}
        diagnosticsSummary={diagnosticsSummary}
        disciplineOptions={disciplineOptions}
        loadingModules={loadingModules}
        loadingSuperAdmins={loadingSuperAdmins}
        modules={modules}
        onAuthorModule={authorModule}
        onCheckOutdated={checkOutdated}
        onContributeModule={contributeModule}
        onCreateOrganization={createOrganization}
        onCreateSuperAdmin={createSuperAdmin}
        onInstallModule={installModule}
        onInviteAdmin={inviteOrganizationAdmin}
        onRefreshDiagnostics={loadDiagnostics}
        onRemoveModule={removeModule}
        onRemoveSuperAdmin={removeSuperAdmin}
        onRetryOutboxEvents={retryOutboxEvents}
        onSelectTab={selectTab}
        onToggleAutoPoll={setAutoPoll}
        onVerifyModule={verifyModule}
        outdated={outdated}
        retryingOutbox={retryingOutbox}
        superAdmins={superAdmins}
        verification={verification}
      />
    </ReadState>
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
