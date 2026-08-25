import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, defineMessages, useIntl } from 'react-intl';
import {
  createControlApiClient,
  organizationEmblemUrl,
  type ControlApiClient,
  type OrganizationResponse,
  type OrganizationStorageUsageResponse,
  type StatisticsRebuildResponse,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { FramedImage } from './FramedImage.js';
import { ImageCropModal } from './ImageCropModal.js';
import { ClubEmblemPlaceholder } from './placeholders.js';
import { Button } from './ui/atoms/button.js';
import { messages as controlMessages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';

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

const preferencesPagePadding = 'clamp(var(--cl-space-3), 4vw, var(--cl-space-8))';
const preferencesSectionPadding = 'clamp(var(--cl-space-3), 4vw, var(--cl-space-6))';

export function PreferencesRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias?: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const [tokens, setTokens] = useState<readonly PatResponse[]>([]);
  const [newToken, setNewToken] = useState<PatCreatedResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

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
      setTokens([...tokens, data]);
      setLabel('');
    }
  };

  const handleRevoke = async (tokenId: string) => {
    const token = controlTokenStore.read();
    const res = await fetch(`/api/auth/pat/${tokenId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      setTokens(tokens.filter((t) => t.tokenId !== tokenId));
    }
  };

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
  const [emblemCropSrc, setEmblemCropSrc] = useState<string | undefined>(undefined);

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
  // same pattern used by ZoneGroupRoute.tsx (0108).
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

  const [rebuildTournamentAlias, setRebuildTournamentAlias] = useState('');
  const [rebuildConfirming, setRebuildConfirming] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<StatisticsRebuildResponse | undefined>(
    undefined,
  );

  async function runStatisticsRebuild(): Promise<void> {
    if (!api.rebuildStatistics || organizationAlias === undefined) return;
    try {
      const result = await api.rebuildStatistics(
        organizationAlias,
        rebuildTournamentAlias.trim() === '' ? undefined : rebuildTournamentAlias.trim(),
      );
      setRebuildResult(result);
    } catch (error) {
      setRebuildResult(undefined);
      pushError(error);
    } finally {
      setRebuildConfirming(false);
    }
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '800px',
        margin: '0 auto',
        padding: preferencesPagePadding,
      }}
    >
      <h1>
        <FormattedMessage {...messages.title} />
      </h1>

      <section
        style={{
          marginTop: '2rem',
          background: 'var(--cl-surface-alt)',
          padding: preferencesSectionPadding,
          borderRadius: '8px',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="pat-label">
              <FormattedMessage {...messages.patLabel} />
            </label>
            <input
              id="pat-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              style={{ padding: '0.5rem', border: '1px solid var(--cl-border-base)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="pat-expires">
              <FormattedMessage {...messages.patExpiresIn} />
            </label>
            <input
              id="pat-expires"
              type="number"
              min="1"
              max="365"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(parseInt(e.target.value))}
              required
              style={{
                padding: '0.5rem',
                border: '1px solid var(--cl-border-base)',
                width: '80px',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!label.trim()}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--cl-state-live)',
              color: 'var(--cl-surface-base)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            <FormattedMessage {...messages.createPat} />
          </button>
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
            <p>Cargando...</p>
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
                      borderBottom: '1px solid var(--cl-border-base)',
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
                    <button
                      onClick={() => handleRevoke(token.tokenId)}
                      style={{
                        background: 'transparent',
                        color: 'var(--cl-state-destructive)',
                        border: '1px solid currentColor',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <FormattedMessage {...messages.revokePat} />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      {organizationAlias !== undefined && (
        <section
          aria-label={intl.formatMessage(controlMessages.orgIdentityHeading)}
          style={{
            marginTop: '2rem',
            background: 'var(--cl-surface-alt)',
            padding: preferencesSectionPadding,
            borderRadius: '8px',
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
            <p className="cl-inline-alert" role="alert">
              {orgLoadError}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                <label>
                  <FormattedMessage {...controlMessages.orgIdentityUploadEmblem} />
                  <input
                    accept="image/*"
                    aria-label={intl.formatMessage(controlMessages.orgIdentityUploadEmblem)}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) setEmblemCropSrc(URL.createObjectURL(file));
                      event.currentTarget.value = '';
                    }}
                    type="file"
                  />
                </label>
              )}

              <div
                style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label htmlFor="org-name">
                    <FormattedMessage {...controlMessages.orgIdentityName} />
                  </label>
                  <input
                    id="org-name"
                    onChange={(event) => setOrgName(event.target.value)}
                    style={{ padding: '0.5rem', border: '1px solid var(--cl-border-base)' }}
                    type="text"
                    value={orgName}
                  />
                </div>
                <Button onClick={() => void saveOrganizationName()} type="button">
                  <FormattedMessage {...controlMessages.orgIdentitySave} />
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {organizationAlias !== undefined && (
        <section
          aria-label={intl.formatMessage(controlMessages.statisticsRebuildHeading)}
          style={{
            marginTop: '2rem',
            background: 'var(--cl-surface-alt)',
            padding: preferencesSectionPadding,
            borderRadius: '8px',
          }}
        >
          <h2>
            <FormattedMessage {...controlMessages.statisticsRebuildHeading} />
          </h2>
          <p>
            <FormattedMessage {...controlMessages.statisticsRebuildDescription} />
          </p>

          {rebuildResult && (
            <p className="cl-inline-alert">
              {intl.formatMessage(controlMessages.statisticsRebuildResult, {
                matches: rebuildResult.matches,
              })}
            </p>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label htmlFor="rebuild-tournament">
                <FormattedMessage {...controlMessages.statisticsRebuildTournamentLabel} />
              </label>
              <input
                id="rebuild-tournament"
                onChange={(event) => setRebuildTournamentAlias(event.target.value)}
                placeholder={intl.formatMessage(
                  controlMessages.statisticsRebuildTournamentPlaceholder,
                )}
                style={{ padding: '0.5rem', border: '1px solid var(--cl-border-base)' }}
                type="text"
                value={rebuildTournamentAlias}
              />
            </div>
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
            <p className="cl-inline-alert" role="alert">
              <FormattedMessage {...controlMessages.statisticsRebuildConfirmPrompt} />
            </p>
          )}
        </section>
      )}

      {organizationAlias !== undefined && (
        <section
          aria-label={intl.formatMessage(controlMessages.storageUsageHeading)}
          style={{
            marginTop: '2rem',
            background: 'var(--cl-surface-alt)',
            padding: preferencesSectionPadding,
            borderRadius: '8px',
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
            <p className="cl-inline-alert" role="alert">
              {storageError}
            </p>
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
        </section>
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
            void uploadOrganizationEmblem(output);
          }}
        />
      )}
    </div>
  );
}
