import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages as controlMessages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type OrganizationResponse,
  type OrganizationStorageUsageResponse,
  type StatisticsRebuildResponse,
  type UnreferencedObjectResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { useToast } from '../ToastProvider.js';
import { PreferencesTemplate } from '../screens/PreferencesTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

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
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );

  const [newToken, setNewToken] = useState<PatCreatedResponse | null>(null);
  const [orgNameEdit, setOrgName] = useState<string | undefined>(undefined);
  const read = useResilientRead(
    `control-preferences:${organizationAlias ?? 'personal'}`,
    async () => {
      const token = controlTokenStore.read();
      const [response, organization, storageUsage, unreferencedObjects] = await Promise.all([
        requestPat('/api/auth/pat', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
        organizationAlias === undefined ? undefined : api.getOrganization?.(organizationAlias),
        organizationAlias === undefined ? undefined : api.getStorageUsage?.(organizationAlias),
        organizationAlias === undefined
          ? []
          : (api.listUnreferencedObjects?.(organizationAlias) ?? []),
      ]);
      if (!response.ok) throw new Error('Personal access tokens could not be loaded');
      const tokens = (await response.json()) as readonly PatResponse[];
      return { tokens, organization, storageUsage, unreferencedObjects };
    },
    {
      thing: intl.formatMessage(controlMessages.preferencesTitle),
      isEmpty: (value) => value.tokens.length === 0 && value.organization === undefined,
    },
  );
  const { tokens = [], organization, storageUsage, unreferencedObjects = [] } = read.data ?? {};
  const orgName = orgNameEdit ?? organization?.name ?? '';
  const setTokens = (change: (current: readonly PatResponse[]) => readonly PatResponse[]): void =>
    read.update((current) => ({ ...current, tokens: change(current.tokens) }));
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

  async function createPat(label: string, expiresInDays: number): Promise<boolean> {
    if (!label.trim()) return false;

    const token = controlTokenStore.read();
    const res = await requestPat('/api/auth/pat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ label, expiresInDays }),
    });

    if (res.ok) {
      const data = (await res.json()) as PatCreatedResponse;
      setNewToken(data);
      setTokens((current) => [...current, data]);
      return true;
    }
    return false;
  }

  async function revokePat(tokenId: string): Promise<void> {
    const token = controlTokenStore.read();
    const res = await requestPat(`/api/auth/pat/${tokenId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      setTokens((current) => current.filter((t) => t.tokenId !== tokenId));
    }
  }

  async function deleteUnreferencedObject(objectId: string): Promise<void> {
    if (!api.deleteObject || organizationAlias === undefined) return;
    try {
      const deleted = await api.deleteObject(organizationAlias, objectId);
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

  async function saveOrganizationName(): Promise<void> {
    if (!api.updateOrganizationSettings || organizationAlias === undefined) return;
    try {
      const updated = await api.updateOrganizationSettings(organizationAlias, {
        name: orgName.trim(),
      });
      setOrganization(updated);
      push({ severity: 'success', message: intl.formatMessage(controlMessages.orgIdentitySaved) });
    } catch (error) {
      pushError(error);
    }
  }

  async function uploadOrganizationEmblem(output: {
    contentBase64: string;
    contentType: 'image/png';
  }): Promise<void> {
    if (!api.uploadOrganizationEmblem || organizationAlias === undefined) return;
    try {
      await api.uploadOrganizationEmblem(organizationAlias, {
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

  async function runStatisticsRebuild(tournamentAlias: string): Promise<void> {
    if (!api.rebuildStatistics || organizationAlias === undefined) return;
    try {
      const result = await api.rebuildStatistics(
        organizationAlias,
        tournamentAlias.trim() === '' ? undefined : tournamentAlias.trim(),
      );
      setRebuildResult(result);
    } catch (error) {
      setRebuildResult(undefined);
      pushError(error);
    }
  }

  return (
    <ReadState {...read} title={intl.formatMessage(controlMessages.preferencesTitle)}>
      <PreferencesTemplate
        api={api}
        isOrganizationPage={isOrganizationPage}
        loading={false}
        newToken={newToken}
        onChangeOrgName={setOrgName}
        onCreatePat={createPat}
        onDeleteUnreferencedObject={deleteUnreferencedObject}
        onRevokePat={revokePat}
        onRunStatisticsRebuild={runStatisticsRebuild}
        onSaveOrganizationName={saveOrganizationName}
        onUploadOrganizationEmblem={uploadOrganizationEmblem}
        organization={organization}
        organizationAlias={organizationAlias}
        orgLoadError={undefined}
        orgLoading={false}
        orgName={orgName}
        rebuildResult={rebuildResult}
        storageError={undefined}
        storageLoading={false}
        storageUsage={storageUsage}
        tokens={tokens}
        unreferencedObjects={unreferencedObjects}
      />
    </ReadState>
  );
}
