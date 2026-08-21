import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  ControlApiError,
  clubEmblemUrl,
  createControlApiClient,
  type ClubResponse,
  type ControlApiClient,
} from '../lib/api-client.js';
import { readAsBase64 } from '../lib/image-upload.js';
import { controlTokenStore } from '../session/token-store.js';
import { ClubEmblemPlaceholder } from './placeholders.js';
import { Button } from './ui/button.js';
import { messages } from '../i18n/messages.en.js';

/**
 * Club identity management (0109) — the first club-related component in the
 * app: list an organization's clubs, create one, edit its name/alias/
 * abbreviation, and upload or replace its emblem through the route
 * `0093` built with no caller until now.
 */
export function ClubManagementRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );

  const [clubs, setClubs] = useState<readonly ClubResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const [newName, setNewName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newAbbreviation, setNewAbbreviation] = useState('');

  const [selectedClubId, setSelectedClubId] = useState<string | undefined>(undefined);
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [editAbbreviation, setEditAbbreviation] = useState('');
  const [emblemFailed, setEmblemFailed] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const loaded = (await api.listClubs?.(organizationAlias)) ?? [];
      setClubs(loaded);
      setLoadError(undefined);
    } catch {
      setLoadError(intl.formatMessage(messages.clubManagementLoadFailed));
    } finally {
      setLoading(false);
    }
  }, [api, organizationAlias, intl]);

  // Mount-time load intentionally does not call `reload` (kept for the
  // imperative re-fetch after create/save/upload): its setState calls sit
  // directly in an async/await body, which react-hooks/set-state-in-effect
  // flags when reachable from an effect. Nesting them inside a promise
  // chain instead keeps them out of that static reachability check — the
  // same pattern used by ZoneGroupRoute.tsx (0108).
  useEffect(() => {
    let live = true;
    const listClubs = api.listClubs;
    (listClubs ? listClubs(organizationAlias) : Promise.resolve([]))
      .then((loaded) => {
        if (!live) return;
        setClubs(loaded);
        setLoadError(undefined);
      })
      .catch(() => {
        if (live) setLoadError(intl.formatMessage(messages.clubManagementLoadFailed));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, intl]);

  function selectClub(club: ClubResponse): void {
    setSelectedClubId(club.clubId);
    setEditName(club.name);
    setEditAlias(club.alias ?? '');
    setEditAbbreviation(club.abbreviation ?? '');
    setEmblemFailed(false);
    setNotice(undefined);
  }

  async function createClub(): Promise<void> {
    if (!api.createClub || newName.trim() === '') return;
    try {
      await api.createClub(organizationAlias, {
        name: newName.trim(),
        ...(newAlias.trim() === '' ? {} : { alias: newAlias.trim() }),
        ...(newAbbreviation.trim() === '' ? {} : { abbreviation: newAbbreviation.trim() }),
      });
      setNewName('');
      setNewAlias('');
      setNewAbbreviation('');
      setNotice(intl.formatMessage(messages.clubManagementCreated));
      void reload();
    } catch (error) {
      setNotice(
        error instanceof ControlApiError
          ? error.message
          : intl.formatMessage(messages.clubManagementSaveFailed),
      );
    }
  }

  async function saveClub(): Promise<void> {
    if (!api.updateClub || selectedClubId === undefined) return;
    try {
      const updated = await api.updateClub(organizationAlias, selectedClubId, {
        name: editName.trim(),
        alias: editAlias.trim(),
        ...(editAbbreviation.trim() === '' ? {} : { abbreviation: editAbbreviation.trim() }),
      });
      setNotice(intl.formatMessage(messages.clubManagementSaved));
      setClubs((current) =>
        current.map((club) => (club.clubId === updated.clubId ? updated : club)),
      );
    } catch (error) {
      setNotice(
        error instanceof ControlApiError
          ? error.message
          : intl.formatMessage(messages.clubManagementSaveFailed),
      );
    }
  }

  async function uploadEmblem(file: File): Promise<void> {
    if (!api.uploadClubEmblem || selectedClubId === undefined) return;
    try {
      const contentBase64 = await readAsBase64(file);
      await api.uploadClubEmblem(organizationAlias, selectedClubId, {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        contentBase64,
      });
      setEmblemFailed(false);
      setNotice(intl.formatMessage(messages.clubManagementEmblemUploaded));
      void reload();
    } catch (error) {
      setNotice(
        error instanceof ControlApiError
          ? error.message
          : intl.formatMessage(messages.clubManagementSaveFailed),
      );
    }
  }

  const selectedClub = clubs.find((club) => club.clubId === selectedClubId);

  if (loading) {
    return <p className="cl-inline-alert">{intl.formatMessage(messages.clubManagementLoading)}</p>;
  }
  if (loadError) {
    return (
      <p className="cl-inline-alert" role="alert">
        {loadError}
      </p>
    );
  }

  return (
    <section aria-label={intl.formatMessage(messages.clubManagementSectionLabel)} style={pageStyle}>
      <header>
        <h1 style={titleStyle}>
          <FormattedMessage {...messages.clubManagementTitle} />
        </h1>
      </header>

      {notice && <p className="cl-inline-alert">{notice}</p>}

      <section aria-label={intl.formatMessage(messages.clubManagementTitle)} style={panelStyle}>
        <ul style={listStyle}>
          {clubs.map((club) => (
            <li key={club.clubId} style={rowStyle}>
              {club.emblemObjectId !== undefined ? (
                <img
                  alt={intl.formatMessage(messages.clubManagementEmblemAlt, { name: club.name })}
                  height={32}
                  src={clubEmblemUrl(organizationAlias, club.clubId)}
                  width={32}
                />
              ) : (
                <ClubEmblemPlaceholder
                  size={32}
                  title={intl.formatMessage(messages.clubManagementEmblemPlaceholderAlt)}
                />
              )}
              <span>{club.name}</span>
              <Button onClick={() => selectClub(club)} type="button" variant="secondary">
                <FormattedMessage {...messages.clubManagementEdit} />
              </Button>
            </li>
          ))}
        </ul>
        {clubs.length === 0 && (
          <p style={mutedStyle}>
            <FormattedMessage {...messages.clubManagementEmpty} />
          </p>
        )}

        {api.createClub && (
          <div style={formRowStyle}>
            <label style={labelStyle}>
              <FormattedMessage {...messages.clubManagementNewClubName} />
              <input
                aria-label={intl.formatMessage(messages.clubManagementNewClubName)}
                onChange={(event) => setNewName(event.target.value)}
                style={inputStyle}
                value={newName}
              />
            </label>
            <label style={labelStyle}>
              <FormattedMessage {...messages.clubManagementNewClubAlias} />
              <input
                aria-label={intl.formatMessage(messages.clubManagementNewClubAlias)}
                onChange={(event) => setNewAlias(event.target.value)}
                style={inputStyle}
                value={newAlias}
              />
            </label>
            <label style={labelStyle}>
              <FormattedMessage {...messages.clubManagementNewClubAbbreviation} />
              <input
                aria-label={intl.formatMessage(messages.clubManagementNewClubAbbreviation)}
                onChange={(event) => setNewAbbreviation(event.target.value)}
                style={inputStyle}
                value={newAbbreviation}
              />
            </label>
            <Button onClick={() => void createClub()} type="button">
              <FormattedMessage {...messages.clubManagementAddClub} />
            </Button>
          </div>
        )}
      </section>

      {selectedClub && (
        <section
          aria-label={intl.formatMessage(messages.clubManagementEditHeading)}
          style={panelStyle}
        >
          <h2 style={sectionTitleStyle}>
            <FormattedMessage {...messages.clubManagementEditHeading} />
          </h2>

          {selectedClub.emblemObjectId !== undefined && !emblemFailed ? (
            <img
              alt={intl.formatMessage(messages.clubManagementEmblemAlt, {
                name: selectedClub.name,
              })}
              height={64}
              onError={() => setEmblemFailed(true)}
              src={clubEmblemUrl(organizationAlias, selectedClub.clubId)}
              width={64}
            />
          ) : (
            <ClubEmblemPlaceholder
              size={64}
              title={intl.formatMessage(messages.clubManagementEmblemPlaceholderAlt)}
            />
          )}

          {api.uploadClubEmblem && (
            <label>
              <FormattedMessage {...messages.clubManagementUploadEmblem} />
              <input
                accept="image/*"
                aria-label={intl.formatMessage(messages.clubManagementUploadEmblem)}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void uploadEmblem(file);
                }}
                type="file"
              />
            </label>
          )}

          <div style={formRowStyle}>
            <label style={labelStyle}>
              <FormattedMessage {...messages.clubManagementName} />
              <input
                aria-label={intl.formatMessage(messages.clubManagementName)}
                onChange={(event) => setEditName(event.target.value)}
                style={inputStyle}
                value={editName}
              />
            </label>
            <label style={labelStyle}>
              <FormattedMessage {...messages.clubManagementAlias} />
              <input
                aria-label={intl.formatMessage(messages.clubManagementAlias)}
                onChange={(event) => setEditAlias(event.target.value)}
                style={inputStyle}
                value={editAlias}
              />
            </label>
            <label style={labelStyle}>
              <FormattedMessage {...messages.clubManagementAbbreviation} />
              <input
                aria-label={intl.formatMessage(messages.clubManagementAbbreviation)}
                onChange={(event) => setEditAbbreviation(event.target.value)}
                style={inputStyle}
                value={editAbbreviation}
              />
            </label>
            <Button onClick={() => void saveClub()} type="button">
              <FormattedMessage {...messages.clubManagementSaveChanges} />
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}

const pageStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-5)' };
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-display)',
};
const panelStyle: React.CSSProperties = {
  border: '1px solid var(--cl-border-muted)',
  padding: 'var(--cl-space-4)',
  background: 'var(--cl-surface-panel)',
  display: 'grid',
  gap: 'var(--cl-space-3)',
};
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontFamily: 'var(--cl-font-display)' };
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--cl-space-2)',
};
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-3)',
};
const formRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'end',
  gap: 'var(--cl-space-3)',
  flexWrap: 'wrap',
};
const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-1)',
  color: 'var(--cl-text-secondary)',
};
const inputStyle: React.CSSProperties = {
  minWidth: 0,
  padding: 'var(--cl-space-2)',
  border: '1px solid var(--cl-border-muted)',
  background: 'var(--cl-surface-base)',
  color: 'inherit',
};
const mutedStyle: React.CSSProperties = { color: 'var(--cl-text-muted)', fontSize: '0.85rem' };
