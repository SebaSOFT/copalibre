import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type OrganizationResponse,
  type OrganizationStorageUsageResponse,
  type StatisticsRebuildResponse,
  type UnreferencedObjectResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages as controlMessages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import { PreferencesTemplate } from '../screens/PreferencesTemplate.js';

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
 * Fetches and mutates (openspec 0225 task 6.2): every call into the API
 * client — including the raw `fetch` calls the personal-access-token
 * section makes directly, since that endpoint predates `ControlApiClient`
 * — lives here; `PreferencesTemplate` composes the four sections from the
 * resulting data and the callbacks below.
 */
export function PreferencesPage({
  organizationAlias,
  client,
}: {
  readonly organizationAlias?: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const [tokens, setTokens] = useState<readonly PatResponse[]>([]);
  const [newToken, setNewToken] = useState<PatCreatedResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const token = controlTokenStore.read();
    void fetch('/api/auth/pat', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then((res) => {
      if (res.ok) {
        res.json().then((data) => {
          if (mounted) {
            setTokens(data as PatResponse[]);
            setLoading(false);
          }
        });
      } else {
        if (mounted) setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function createPat(label: string, expiresInDays: number): Promise<boolean> {
    if (!label.trim()) return false;

    const token = controlTokenStore.read();
    const res = await fetch('/api/auth/pat', {
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
    const res = await fetch(`/api/auth/pat/${tokenId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      setTokens((current) => current.filter((t) => t.tokenId !== tokenId));
    }
  }

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

  const [organization, setOrganization] = useState<OrganizationResponse | undefined>(undefined);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgLoadError, setOrgLoadError] = useState<string | undefined>(undefined);
  const [orgName, setOrgName] = useState('');

  const reloadOrganization = useCallback(async (): Promise<void> => {
    if (organizationAlias === undefined) return;
    setOrgLoading(true);
    try {
      const loaded = await api.getOrganization?.(organizationAlias);
      setOrganization(loaded);
      if (loaded) setOrgName(loaded.name);
      setOrgLoadError(undefined);
    } catch {
      setOrgLoadError(intl.formatMessage(controlMessages.orgIdentityLoadFailed));
    } finally {
      setOrgLoading(false);
    }
  }, [api, organizationAlias, intl]);

  // Mount-time load intentionally does not call `reloadOrganization` (kept
  // for the imperative re-fetch after save/upload): its setState calls sit
  // directly in an async/await body, which react-hooks/set-state-in-effect
  // flags when reachable from an effect. Nesting them inside a promise
  // chain instead keeps them out of that static reachability check — the
  // same pattern used by ZoneGroupPage.tsx.
  useEffect(() => {
    if (organizationAlias === undefined) return undefined;
    let live = true;
    const getOrganization = api.getOrganization;
    (getOrganization ? getOrganization(organizationAlias) : Promise.resolve(undefined))
      .then((loaded) => {
        if (!live) return;
        setOrganization(loaded);
        if (loaded) setOrgName(loaded.name);
        setOrgLoadError(undefined);
      })
      .catch(() => {
        if (live) setOrgLoadError(intl.formatMessage(controlMessages.orgIdentityLoadFailed));
      })
      .finally(() => {
        if (live) setOrgLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, intl]);

  const [storageUsage, setStorageUsage] = useState<OrganizationStorageUsageResponse | undefined>(
    undefined,
  );
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (organizationAlias === undefined) return undefined;
    let live = true;
    const getStorageUsage = api.getStorageUsage;
    (getStorageUsage ? getStorageUsage(organizationAlias) : Promise.resolve(undefined))
      .then((loaded) => {
        if (!live) return;
        setStorageUsage(loaded);
        setStorageError(undefined);
      })
      .catch(() => {
        if (live) setStorageError(intl.formatMessage(controlMessages.storageUsageLoadFailed));
      })
      .finally(() => {
        if (live) setStorageLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, intl]);

  const [unreferencedObjects, setUnreferencedObjects] = useState<
    readonly UnreferencedObjectResponse[]
  >([]);

  const reloadUnreferencedObjects = useCallback(() => {
    if (organizationAlias === undefined || !api.listUnreferencedObjects) return;
    api
      .listUnreferencedObjects(organizationAlias)
      .then(setUnreferencedObjects)
      .catch(() => {
        // A quiet, empty-by-default list — a failed load just leaves it empty.
      });
  }, [api, organizationAlias]);

  useEffect(() => {
    reloadUnreferencedObjects();
  }, [reloadUnreferencedObjects]);

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
    <PreferencesTemplate
      api={api}
      loading={loading}
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
      orgLoadError={orgLoadError}
      orgLoading={orgLoading}
      orgName={orgName}
      rebuildResult={rebuildResult}
      storageError={storageError}
      storageLoading={storageLoading}
      storageUsage={storageUsage}
      tokens={tokens}
      unreferencedObjects={unreferencedObjects}
    />
  );
}
