import { API_PATH_PREFIX } from '../../../lib/api-path.js';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type { OrganizationRole } from '@copalibre/domain';
import { messages as controlMessages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type OrganizationResponse,
  type OrganizationStorageUsageResponse,
  type StatisticsRebuildResponse,
  type UnreferencedObjectResponse,
  type UpdateOrganizationSettingsRequest,
} from '../../lib/api-client.js';
import { roleMayUse } from '../../lib/role-access.js';
import { csrfHeaders } from '../../session/csrf.js';
import { useToast } from '../ToastProvider.js';
import { PreferencesTemplate } from '../screens/PreferencesTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/** The API serves tokens from its root, with no prefix. */
export const PAT_PATH = `${API_PATH_PREFIX}/auth/pat`;

export function formatStorageBytes(bytes: number): string {
  const ONE_MB = 1024 * 1024;
  const ONE_GB = 1024 * 1024 * 1024;
  if (bytes >= ONE_GB) {
    const gb = bytes / ONE_GB;
    return `${Number(gb.toFixed(2))} GB`;
  }
  const mb = bytes / ONE_MB;
  return `${Number(mb.toFixed(2))} MB`;
}

/** The organization settings the identity card edits, always whole: edits overlay the saved values. */
export interface OrganizationSettingsDraft {
  readonly name: string;
  readonly primaryLanguage: string;
  readonly timezone: string;
}

export interface PatResponse {
  readonly tokenId: string;
  readonly label: string;
  readonly scopes: readonly string[];
  readonly revoked: boolean;
  readonly expiresAt: string;
  readonly lastUsedAt?: string;
  readonly createdAt: string;
}

export interface PatCreatedResponse extends PatResponse {
  readonly token: string;
}

export interface PatRevocationPreview {
  readonly reversible: boolean;
  readonly tokens: number;
  readonly lastUsedAt?: string;
}

interface PatScopeOptionsResponse {
  readonly scopes: readonly string[];
}

/**
 * Fetches and mutates: every call into the API
 * client — including the raw `fetch` calls the personal-access-token
 * section makes directly, since that endpoint predates `ControlApiClient` —
 * lives here; `PreferencesTemplate` composes the four sections from the
 * resulting data and the callbacks below.
 */
export function PreferencesPage({
  isOrganizationPage,
  organizationAlias,
  client,
  patFetch,
}: {
  readonly isOrganizationPage?: boolean;
  readonly organizationAlias?: string;
  readonly client?: ControlApiClient;
  readonly patFetch?: typeof globalThis.fetch;
}): React.JSX.Element {
  const requestPat = patFetch ?? globalThis.fetch;
  const intl = useIntl();
  const { push, pushError } = useToast();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
      }),
    [client],
  );

  const [newToken, setNewToken] = useState<PatCreatedResponse | null>(null);
  const [settingsEdit, setSettingsEdit] = useState<Partial<OrganizationSettingsDraft>>({});
  const organizationScope = isOrganizationPage ? organizationAlias : undefined;
  const read = useResilientRead(
    `control-preferences:${organizationScope ?? 'personal'}`,
    async () => {
      if (organizationScope === undefined) {
        return {
          role: undefined as OrganizationRole | undefined,
          organization: undefined as OrganizationResponse | undefined,
          storageUsage: undefined as OrganizationStorageUsageResponse | undefined,
          unreferencedObjects: [] as readonly UnreferencedObjectResponse[],
        };
      }
      // A role that cannot be resolved is treated as unknown, which offers every section (the
      // server still refuses what the role cannot do): the screen must not fail for the role alone.
      const role = await api
        .listMyOrganizations()
        .then((mine) => mine.find((one) => one.organizationAlias === organizationScope)?.role)
        .catch(() => undefined);
      // The API refuses storage to a role without settings authority, and a refused request would
      // fail the whole read, so a role that cannot use the section is never asked for it.
      const readsStorage = roleMayUse(role, 'org.manage-settings');
      const [organization, storageUsage, unreferencedObjects] = await Promise.all([
        api.getOrganization?.(organizationScope),
        readsStorage ? api.getStorageUsage?.(organizationScope) : undefined,
        readsStorage ? (api.listUnreferencedObjects?.(organizationScope) ?? []) : [],
      ]);
      return { role, organization, storageUsage, unreferencedObjects };
    },
    {
      thing: intl.formatMessage(controlMessages.preferencesTitle),
      // Every section has its own empty state, so the page itself is never empty.
      isEmpty: () => false,
    },
  );
  // Tokens read apart from the rest: a failure here must not take down the organization settings.
  const tokenRead = useResilientRead(
    'control-preferences-tokens',
    async () => {
      const [response, scopeResponse] = await Promise.all([
        requestPat(PAT_PATH, { credentials: 'same-origin' }),
        requestPat(`${PAT_PATH}/scopes`, { credentials: 'same-origin' }),
      ]);
      if (!response.ok || !scopeResponse.ok)
        throw new Error('Personal access tokens could not be loaded');
      const tokens = (await response.json()) as readonly PatResponse[];
      const patScopes = ((await scopeResponse.json()) as PatScopeOptionsResponse).scopes;
      return { tokens, patScopes };
    },
    {
      thing: intl.formatMessage(controlMessages.preferencesPatTitle),
      isEmpty: (value) => value.tokens.length === 0,
    },
  );
  const { role, organization, storageUsage, unreferencedObjects = [] } = read.data ?? {};
  const { tokens = [], patScopes = [] } = tokenRead.data ?? {};
  const settingsDraft: OrganizationSettingsDraft = {
    name: settingsEdit.name ?? organization?.name ?? '',
    primaryLanguage: settingsEdit.primaryLanguage ?? organization?.primaryLanguage ?? '',
    timezone: settingsEdit.timezone ?? organization?.timezone ?? '',
  };
  const setTokens = (change: (current: readonly PatResponse[]) => readonly PatResponse[]): void =>
    tokenRead.update((current) => ({ ...current, tokens: change(current.tokens) }));
  const setOrganization = (organization: OrganizationResponse): void =>
    read.update((current) => ({ ...current, organization }));
  const setUnreferencedObjects = (
    change: (
      current: readonly UnreferencedObjectResponse[],
    ) => readonly UnreferencedObjectResponse[],
  ): void =>
    read.update((current) => ({
      ...current,
      unreferencedObjects: change(current.unreferencedObjects),
    }));
  const setStorageUsage = (
    change: (
      current: OrganizationStorageUsageResponse | undefined,
    ) => OrganizationStorageUsageResponse | undefined,
  ): void => read.update((current) => ({ ...current, storageUsage: change(current.storageUsage) }));
  const reloadOrganization = read.retry;

  async function createPat(
    label: string,
    expiresInDays: number,
    scopes: readonly string[],
  ): Promise<boolean> {
    if (!label.trim() || scopes.length === 0) return false;

    const res = await requestPat(PAT_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders('POST') },
      body: JSON.stringify({ label, scopes, expiresInDays }),
    });

    if (res.ok) {
      const data = (await res.json()) as PatCreatedResponse;
      setNewToken(data);
      setTokens((current) => [...current, data]);
      return true;
    }
    return false;
  }

  async function revokePat(tokenId: string): Promise<PatRevocationPreview | undefined> {
    const headers: HeadersInit = csrfHeaders('DELETE');
    try {
      const previewResponse = await requestPat(`${PAT_PATH}/${tokenId}?dryRun=true`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers,
      });
      if (!previewResponse.ok) throw new Error('Personal access token could not be previewed');
      const preview = (await previewResponse.json()) as PatRevocationPreview;
      if (!preview.reversible) return preview;

      const response = await requestPat(`${PAT_PATH}/${tokenId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers,
      });
      if (!response.ok) throw new Error('Personal access token could not be revoked');
      setTokens((current) => current.filter((currentToken) => currentToken.tokenId !== tokenId));
      const result = (await response.json()) as { readonly reversible: boolean };
      push(
        result.reversible
          ? {
              severity: 'success',
              message: intl.formatMessage(controlMessages.preferencesPatRevoked),
              durationMs: 10_000,
              action: {
                label: intl.formatMessage(controlMessages.preferencesPatUndo),
                onAction: () => void restorePat(tokenId),
              },
            }
          : {
              severity: 'success',
              message: intl.formatMessage(controlMessages.preferencesPatRevoked),
            },
      );
      return undefined;
    } catch (error) {
      pushError(error);
      return undefined;
    }
  }

  async function confirmPatRevoke(tokenId: string): Promise<void> {
    try {
      const response = await requestPat(`${PAT_PATH}/${tokenId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: csrfHeaders('DELETE'),
      });
      if (!response.ok) throw new Error('Personal access token could not be revoked');
      setTokens((current) => current.filter((currentToken) => currentToken.tokenId !== tokenId));
      push({
        severity: 'success',
        message: intl.formatMessage(controlMessages.preferencesPatRevoked),
      });
    } catch (error) {
      pushError(error);
      throw error;
    }
  }

  async function restorePat(tokenId: string): Promise<void> {
    try {
      const response = await requestPat(`${PAT_PATH}/${tokenId}/restore`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrfHeaders('POST'),
      });
      if (!response.ok) throw new Error('Personal access token could not be restored');
      const restored = (await response.json()) as PatResponse;
      setTokens((current) => [...current.filter((item) => item.tokenId !== tokenId), restored]);
      push({
        severity: 'success',
        message: intl.formatMessage(controlMessages.preferencesPatRestored),
      });
    } catch (error) {
      pushError(error);
    }
  }

  async function deleteUnreferencedObject(objectId: string): Promise<void> {
    if (!api.deleteObject || organizationScope === undefined) return;
    try {
      const deleted = await api.deleteObject(organizationScope, objectId);
      setUnreferencedObjects((current) =>
        current.filter((object) => object.objectId !== deleted.objectId),
      );
      setStorageUsage((current) =>
        current === undefined
          ? current
          : {
              totalBytes: current.totalBytes - deleted.sizeBytes,
              objectCount: current.objectCount - 1,
            },
      );
    } catch (error) {
      pushError(error);
    }
  }

  async function saveOrganizationSettings(): Promise<void> {
    if (!api.updateOrganizationSettings || organizationScope === undefined) return;
    if (organization === undefined) return;
    const name = settingsDraft.name.trim();
    const request: UpdateOrganizationSettingsRequest = {
      ...(name !== organization.name ? { name } : {}),
      ...(settingsDraft.primaryLanguage !== organization.primaryLanguage
        ? { primaryLanguage: settingsDraft.primaryLanguage }
        : {}),
      ...(settingsDraft.timezone !== organization.timezone
        ? { timezone: settingsDraft.timezone }
        : {}),
    };
    if (Object.keys(request).length === 0) return;
    try {
      const updated = await api.updateOrganizationSettings(organizationScope, request);
      setOrganization(updated);
      setSettingsEdit({});
      push({ severity: 'success', message: intl.formatMessage(controlMessages.orgIdentitySaved) });
    } catch (error) {
      pushError(error);
    }
  }

  async function uploadOrganizationEmblem(output: {
    contentBase64: string;
    contentType: 'image/png';
  }): Promise<void> {
    if (!api.uploadOrganizationEmblem || organizationScope === undefined) return;
    try {
      await api.uploadOrganizationEmblem(organizationScope, {
        filename: 'emblem.png',
        contentType: output.contentType,
        contentBase64: output.contentBase64,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(controlMessages.orgIdentityEmblemUploaded),
      });
      void reloadOrganization();
    } catch (error) {
      pushError(error);
      throw error;
    }
  }

  const [rebuildResult, setRebuildResult] = useState<StatisticsRebuildResponse | undefined>(
    undefined,
  );

  async function previewStatisticsRebuild(
    tournamentAlias: string,
  ): Promise<StatisticsRebuildResponse | undefined> {
    if (!api.rebuildStatistics || organizationScope === undefined) return undefined;
    try {
      const result = await api.rebuildStatistics(
        organizationScope,
        tournamentAlias.trim() === '' ? undefined : tournamentAlias.trim(),
        true,
      );
      return result.dryRun ? result : undefined;
    } catch (error) {
      pushError(error);
      return undefined;
    }
  }

  async function runStatisticsRebuild(tournamentAlias: string): Promise<boolean> {
    if (!api.rebuildStatistics || organizationScope === undefined) return false;
    try {
      const result = await api.rebuildStatistics(
        organizationScope,
        tournamentAlias.trim() === '' ? undefined : tournamentAlias.trim(),
        false,
      );
      if (result.dryRun) return false;
      setRebuildResult(result);
      return true;
    } catch (error) {
      setRebuildResult(undefined);
      pushError(error);
      return false;
    }
  }

  return (
    <ReadState {...read} title={intl.formatMessage(controlMessages.preferencesTitle)}>
      <PreferencesTemplate
        api={api}
        isOrganizationPage={isOrganizationPage}
        loading={tokenRead.status === 'loading' || tokenRead.status === 'failed-empty'}
        newToken={newToken}
        onChangeSettings={(change) => setSettingsEdit((current) => ({ ...current, ...change }))}
        onCreatePat={createPat}
        onDeleteUnreferencedObject={deleteUnreferencedObject}
        onRevokePat={revokePat}
        onConfirmRevokePat={confirmPatRevoke}
        onPreviewStatisticsRebuild={previewStatisticsRebuild}
        onRunStatisticsRebuild={runStatisticsRebuild}
        onResetSettings={() => setSettingsEdit({})}
        onSaveOrganizationSettings={saveOrganizationSettings}
        onUploadOrganizationEmblem={uploadOrganizationEmblem}
        organization={organization}
        organizationAlias={organizationScope}
        orgLoadError={undefined}
        orgLoading={false}
        role={role}
        settingsDraft={settingsDraft}
        rebuildResult={rebuildResult}
        storageError={undefined}
        storageLoading={false}
        storageUsage={storageUsage}
        tokens={tokens}
        patScopes={patScopes}
        unreferencedObjects={unreferencedObjects}
      />
    </ReadState>
  );
}
