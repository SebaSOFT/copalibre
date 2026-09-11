import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
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
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import type { DisciplineOption } from '../../lib/wizard.js';
import { PlatformAdministrationTemplate } from '../screens/PlatformAdministrationTemplate.js';

/**
 * Fetches and mutates (openspec 0225 task 6.1): every call into the API
 * client lives here, `PlatformAdministrationTemplate` composes the screen
 * from the resulting data and the callbacks below.
 *
 * Unlike most other page/template splits in this surface, the outcome
 * toasts stay here rather than in the template: each one is built from a
 * value the API response itself carries (a created alias, an installed
 * module's version, a pull request URL) — the page "supplies catalogues"
 * role design.md's tier table names, not screen composition.
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
  const [modules, setModules] = useState<readonly InstalledModuleResponse[]>([]);
  const [outdated, setOutdated] = useState<readonly OutdatedModuleResponse[]>([]);
  const [verification, setVerification] = useState<readonly ModuleVerifyResultResponse[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [superAdmins, setSuperAdmins] = useState<readonly InstallationSuperAdminResponse[]>([]);
  const [loadingSuperAdmins, setLoadingSuperAdmins] = useState(true);
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

  return (
    <PlatformAdministrationTemplate
      api={api}
      authoringBusy={authoringBusy}
      authoringFailures={authoringFailures}
      busy={busy}
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
      onRemoveModule={removeModule}
      onRemoveSuperAdmin={removeSuperAdmin}
      onVerifyModule={verifyModule}
      outdated={outdated}
      superAdmins={superAdmins}
      verification={verification}
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
