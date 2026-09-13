import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { clubEmblemUrl, type ClubResponse, type ControlApiClient } from '../../lib/api-client.js';
import { FramedImage } from '../FramedImage.js';
import { ImageCropModal } from '../ImageCropModal.js';
import { ClubEmblemPlaceholder } from '../placeholders.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { FilePicker } from '../ui/atoms/file-picker.js';
import { Input } from '../ui/atoms/input.js';
import { Field } from '../ui/molecules/field.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

/**
 * Composes the screen from the data `ClubManagementPage` supplies (openspec
 * 0225 task 6.2): the new-club form, which club is selected, its edit
 * fields, and the pending emblem crop below are this component's own screen
 * state; every mutation is a call to one of the `on*` props.
 */
export function ClubManagementTemplate({
  api,
  clubs,
  onCreateClub,
  onSaveClub,
  onUploadClubEmblem,
  organizationAlias,
}: {
  readonly api: ControlApiClient;
  readonly clubs: readonly ClubResponse[];
  readonly onCreateClub: (name: string, alias: string, abbreviation: string) => Promise<boolean>;
  readonly onSaveClub: (
    clubId: string,
    name: string,
    alias: string,
    abbreviation: string,
  ) => Promise<void>;
  readonly onUploadClubEmblem: (
    clubId: string,
    output: { contentBase64: string; contentType: 'image/png' },
  ) => Promise<void>;
  readonly organizationAlias: string;
}): React.JSX.Element {
  const intl = useIntl();

  const [newName, setNewName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newAbbreviation, setNewAbbreviation] = useState('');

  const [selectedClubId, setSelectedClubId] = useState<string>();
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [editAbbreviation, setEditAbbreviation] = useState('');
  const [emblemCropSrc, setEmblemCropSrc] = useState<string>();

  const selectClub = (club: ClubResponse): void => {
    setSelectedClubId(club.clubId);
    setEditName(club.name);
    setEditAlias(club.alias ?? '');
    setEditAbbreviation(club.abbreviation ?? '');
  };

  async function createClub(): Promise<void> {
    if (await onCreateClub(newName, newAlias, newAbbreviation)) {
      setNewName('');
      setNewAlias('');
      setNewAbbreviation('');
    }
  }

  async function saveClub(): Promise<void> {
    if (selectedClubId === undefined) return;
    await onSaveClub(selectedClubId, editName, editAlias, editAbbreviation);
  }

  async function uploadClubEmblem(output: {
    contentBase64: string;
    contentType: 'image/png';
  }): Promise<void> {
    if (selectedClubId === undefined) return;
    await onUploadClubEmblem(selectedClubId, output);
  }

  const selectedClub = clubs.find((club) => club.clubId === selectedClubId);

  const titleNode = <FormattedMessage {...messages.clubManagementTitle} />;

  const listingNode = (
    <div className="cl-screen-sections">
      <Card
        aria-label={intl.formatMessage(messages.clubManagementTitle)}
        className="cl-chamfer cl-chamfer--control"
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
            <Field
              id="new-club-name"
              label={intl.formatMessage(messages.clubManagementNewClubName)}
            >
              <Input
                aria-label={intl.formatMessage(messages.clubManagementNewClubName)}
                id="new-club-name"
                onChange={(event) => setNewName(event.target.value)}
                value={newName}
              />
            </Field>
            <Field
              id="new-club-alias"
              label={intl.formatMessage(messages.clubManagementNewClubAlias)}
            >
              <Input
                aria-label={intl.formatMessage(messages.clubManagementNewClubAlias)}
                id="new-club-alias"
                onChange={(event) => setNewAlias(event.target.value)}
                value={newAlias}
              />
            </Field>
            <Field
              id="new-club-abbreviation"
              label={intl.formatMessage(messages.clubManagementNewClubAbbreviation)}
            >
              <Input
                aria-label={intl.formatMessage(messages.clubManagementNewClubAbbreviation)}
                id="new-club-abbreviation"
                onChange={(event) => setNewAbbreviation(event.target.value)}
                value={newAbbreviation}
              />
            </Field>
            <Button onClick={() => void createClub()} type="button">
              <FormattedMessage {...messages.clubManagementAddClub} />
            </Button>
          </div>
        )}
      </Card>

      {selectedClub && (
        <Card
          aria-label={intl.formatMessage(messages.clubManagementEditHeading)}
          className="cl-chamfer cl-chamfer--control"
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
              <FilePicker
                accept="image/*"
                aria-label={intl.formatMessage(messages.clubManagementUploadEmblem)}
                id="edit-club-emblem"
                label={intl.formatMessage(messages.clubManagementUploadEmblem)}
                onChange={(files) => {
                  const file = files?.[0];
                  if (file) setEmblemCropSrc(URL.createObjectURL(file));
                }}
              />
            )}

            <div className="cl-platform-form-grid">
              <Field id="edit-club-name" label={intl.formatMessage(messages.clubManagementName)}>
                <Input
                  aria-label={intl.formatMessage(messages.clubManagementName)}
                  id="edit-club-name"
                  onChange={(event) => setEditName(event.target.value)}
                  value={editName}
                />
              </Field>
              <Field id="edit-club-alias" label={intl.formatMessage(messages.clubManagementAlias)}>
                <Input
                  aria-label={intl.formatMessage(messages.clubManagementAlias)}
                  id="edit-club-alias"
                  onChange={(event) => setEditAlias(event.target.value)}
                  value={editAlias}
                />
              </Field>
              <Field
                id="edit-club-abbreviation"
                label={intl.formatMessage(messages.clubManagementAbbreviation)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.clubManagementAbbreviation)}
                  id="edit-club-abbreviation"
                  onChange={(event) => setEditAbbreviation(event.target.value)}
                  value={editAbbreviation}
                />
              </Field>
              <Button onClick={() => void saveClub()} type="button">
                <FormattedMessage {...messages.clubManagementSaveChanges} />
              </Button>
            </div>
          </div>
        </Card>
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
            void uploadClubEmblem(output);
          }}
        />
      )}
    </div>
  );

  return <ListScreenLayout listing={listingNode} title={titleNode} />;
}
