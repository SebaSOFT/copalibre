import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  clubEmblemUrl,
  createControlApiClient,
  type ClubResponse,
  type ControlApiClient,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { FramedImage } from './FramedImage.js';
import { ImageCropModal } from './ImageCropModal.js';
import { ClubEmblemPlaceholder } from './placeholders.js';
import { Button } from './ui/atoms/button.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';

import { ListScreenTemplate } from './ui/templates/list-screen-template.js';

/**
 * Club identity management — the first club-related component in the
 * app: list an organization's clubs, create one, edit its name/alias/
 * abbreviation, and upload or replace its emblem through the route
 * previously built with no caller until now.
 */
export function ClubManagementRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
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

  const [clubs, setClubs] = useState<readonly ClubResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const [newName, setNewName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newAbbreviation, setNewAbbreviation] = useState('');

  const [selectedClubId, setSelectedClubId] = useState<string | undefined>(undefined);
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [editAbbreviation, setEditAbbreviation] = useState('');
  const [emblemCropSrc, setEmblemCropSrc] = useState<string | undefined>(undefined);

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
      push({ severity: 'success', message: intl.formatMessage(messages.clubManagementCreated) });
      void reload();
    } catch (error) {
      pushError(error);
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
      push({ severity: 'success', message: intl.formatMessage(messages.clubManagementSaved) });
      setClubs((current) =>
        current.map((club) => (club.clubId === updated.clubId ? updated : club)),
      );
    } catch (error) {
      pushError(error);
    }
  }

  async function uploadEmblem(output: {
    contentBase64: string;
    contentType: 'image/png';
  }): Promise<void> {
    if (!api.uploadClubEmblem || selectedClubId === undefined) return;
    try {
      await api.uploadClubEmblem(organizationAlias, selectedClubId, {
        filename: 'emblem.png',
        contentType: output.contentType,
        contentBase64: output.contentBase64,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.clubManagementEmblemUploaded),
      });
      void reload();
    } catch (error) {
      pushError(error);
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

  const titleNode = <FormattedMessage {...messages.clubManagementTitle} />;

  const listingNode = (
    <div className="cl-platform-sections">
      <section
        aria-label={intl.formatMessage(messages.clubManagementTitle)}
        className="cl-card cl-chamfer cl-chamfer--control"
      >
        <ul>
          {clubs.map((club) => (
            <li key={club.clubId} className="cl-role-user">
              <FramedImage
                alt={intl.formatMessage(messages.clubManagementEmblemAlt, { name: club.name })}
                placeholder={
                  <ClubEmblemPlaceholder
                    size={32}
                    title={intl.formatMessage(messages.clubManagementEmblemPlaceholderAlt)}
                  />
                }
                size={32}
                src={
                  club.emblemObjectId !== undefined
                    ? clubEmblemUrl(organizationAlias, club.clubId)
                    : undefined
                }
              />
              <span>{club.name}</span>
              <Button onClick={() => selectClub(club)} type="button" variant="secondary">
                <FormattedMessage {...messages.clubManagementEdit} />
              </Button>
            </li>
          ))}
        </ul>
        {clubs.length === 0 && (
          <p className="cl-list-screen__empty">
            <FormattedMessage {...messages.clubManagementEmpty} />
          </p>
        )}

        {api.createClub && (
          <div className="cl-platform-form-grid">
            <label className="cl-form-field">
              <span className="cl-label">
                <FormattedMessage {...messages.clubManagementNewClubName} />
              </span>
              <input
                aria-label={intl.formatMessage(messages.clubManagementNewClubName)}
                className="cl-input cl-input--default"
                onChange={(event) => setNewName(event.target.value)}
                value={newName}
              />
            </label>
            <label className="cl-form-field">
              <span className="cl-label">
                <FormattedMessage {...messages.clubManagementNewClubAlias} />
              </span>
              <input
                aria-label={intl.formatMessage(messages.clubManagementNewClubAlias)}
                className="cl-input cl-input--default"
                onChange={(event) => setNewAlias(event.target.value)}
                value={newAlias}
              />
            </label>
            <label className="cl-form-field">
              <span className="cl-label">
                <FormattedMessage {...messages.clubManagementNewClubAbbreviation} />
              </span>
              <input
                aria-label={intl.formatMessage(messages.clubManagementNewClubAbbreviation)}
                className="cl-input cl-input--default"
                onChange={(event) => setNewAbbreviation(event.target.value)}
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
          className="cl-card cl-chamfer cl-chamfer--control"
        >
          <header className="cl-card__header">
            <h2 className="cl-card__title">
              <FormattedMessage {...messages.clubManagementEditHeading} />
            </h2>
          </header>

          <div className="cl-card__content">
            <FramedImage
              key={selectedClub.emblemObjectId ?? 'none'}
              alt={intl.formatMessage(messages.clubManagementEmblemAlt, {
                name: selectedClub.name,
              })}
              placeholder={
                <ClubEmblemPlaceholder
                  size={64}
                  title={intl.formatMessage(messages.clubManagementEmblemPlaceholderAlt)}
                />
              }
              size={64}
              src={
                selectedClub.emblemObjectId !== undefined
                  ? clubEmblemUrl(organizationAlias, selectedClub.clubId)
                  : undefined
              }
            />

            {api.uploadClubEmblem && (
              <label className="cl-form-field">
                <span className="cl-label">
                  <FormattedMessage {...messages.clubManagementUploadEmblem} />
                </span>
                <input
                  accept="image/*"
                  aria-label={intl.formatMessage(messages.clubManagementUploadEmblem)}
                  className="cl-input cl-input--default"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) setEmblemCropSrc(URL.createObjectURL(file));
                    event.currentTarget.value = '';
                  }}
                  type="file"
                />
              </label>
            )}

            <div className="cl-platform-form-grid">
              <label className="cl-form-field">
                <span className="cl-label">
                  <FormattedMessage {...messages.clubManagementName} />
                </span>
                <input
                  aria-label={intl.formatMessage(messages.clubManagementName)}
                  className="cl-input cl-input--default"
                  onChange={(event) => setEditName(event.target.value)}
                  value={editName}
                />
              </label>
              <label className="cl-form-field">
                <span className="cl-label">
                  <FormattedMessage {...messages.clubManagementAlias} />
                </span>
                <input
                  aria-label={intl.formatMessage(messages.clubManagementAlias)}
                  className="cl-input cl-input--default"
                  onChange={(event) => setEditAlias(event.target.value)}
                  value={editAlias}
                />
              </label>
              <label className="cl-form-field">
                <span className="cl-label">
                  <FormattedMessage {...messages.clubManagementAbbreviation} />
                </span>
                <input
                  aria-label={intl.formatMessage(messages.clubManagementAbbreviation)}
                  className="cl-input cl-input--default"
                  onChange={(event) => setEditAbbreviation(event.target.value)}
                  value={editAbbreviation}
                />
              </label>
              <Button onClick={() => void saveClub()} type="button">
                <FormattedMessage {...messages.clubManagementSaveChanges} />
              </Button>
            </div>
          </div>
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
            void uploadEmblem(output);
          }}
        />
      )}
    </div>
  );

  return <ListScreenTemplate listing={listingNode} title={titleNode} />;
}
