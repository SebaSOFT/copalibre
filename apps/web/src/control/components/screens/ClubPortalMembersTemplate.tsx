import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { ClubMemberResponse, ControlApiClient } from '../../lib/api-client.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Input } from '../ui/atoms/input.js';
import { Field } from '../ui/molecules/field.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

/**
 * Composes the screen from the data `ClubPortalMembersPage` supplies: which
 * member is selected and its edit fields are this component's own screen
 * state, mirroring `ClubManagementTemplate`'s own shape for club identity —
 * every mutation is a call to one of the `on*` props.
 */
export function ClubPortalMembersTemplate({
  api,
  members,
  onCreateMember,
  onSaveMember,
}: {
  readonly api: ControlApiClient;
  readonly members: readonly ClubMemberResponse[];
  readonly onCreateMember: (
    displayName: string,
    alias: string,
    birthDate: string,
  ) => Promise<boolean>;
  readonly onSaveMember: (personId: string, displayName: string, alias: string) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();

  const [newDisplayName, setNewDisplayName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newBirthDate, setNewBirthDate] = useState('');

  const [selectedPersonId, setSelectedPersonId] = useState<string>();
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAlias, setEditAlias] = useState('');

  const selectMember = (member: ClubMemberResponse): void => {
    setSelectedPersonId(member.personId);
    setEditDisplayName(member.displayName);
    setEditAlias(member.alias ?? '');
  };

  async function createMember(): Promise<void> {
    if (await onCreateMember(newDisplayName, newAlias, newBirthDate)) {
      setNewDisplayName('');
      setNewAlias('');
      setNewBirthDate('');
    }
  }

  async function saveMember(): Promise<void> {
    if (selectedPersonId === undefined) return;
    await onSaveMember(selectedPersonId, editDisplayName, editAlias);
  }

  const selectedMember = members.find((member) => member.personId === selectedPersonId);

  const titleNode = <FormattedMessage {...messages.clubPortalMembersTitle} />;

  const listingNode = (
    <div className="cl-screen-sections">
      <Card
        aria-label={intl.formatMessage(messages.clubPortalMembersTitle)}
        className="cl-chamfer cl-chamfer--control"
      >
        <ul>
          {members.map((member) => (
            <li key={member.personId} className="cl-role-user">
              <span>{member.displayName}</span>
              <Button onClick={() => selectMember(member)} type="button" variant="secondary">
                <FormattedMessage {...messages.clubPortalMembersEdit} />
              </Button>
            </li>
          ))}
        </ul>
        {members.length === 0 && (
          <p className="cl-list-screen__empty">
            <FormattedMessage {...messages.clubPortalMembersEmpty} />
          </p>
        )}

        {api.createClubMember && (
          <div className="cl-platform-form-grid">
            <Field
              id="new-member-name"
              label={intl.formatMessage(messages.clubPortalMembersNewMemberName)}
            >
              <Input
                aria-label={intl.formatMessage(messages.clubPortalMembersNewMemberName)}
                id="new-member-name"
                onChange={(event) => setNewDisplayName(event.target.value)}
                value={newDisplayName}
              />
            </Field>
            <Field
              id="new-member-alias"
              label={intl.formatMessage(messages.clubPortalMembersNewMemberAlias)}
            >
              <Input
                aria-label={intl.formatMessage(messages.clubPortalMembersNewMemberAlias)}
                id="new-member-alias"
                onChange={(event) => setNewAlias(event.target.value)}
                value={newAlias}
              />
            </Field>
            <Field
              id="new-member-birth-date"
              label={intl.formatMessage(messages.clubPortalMembersNewMemberBirthDate)}
            >
              <Input
                aria-label={intl.formatMessage(messages.clubPortalMembersNewMemberBirthDate)}
                id="new-member-birth-date"
                onChange={(event) => setNewBirthDate(event.target.value)}
                type="date"
                value={newBirthDate}
              />
            </Field>
            <Button onClick={() => void createMember()} type="button">
              <FormattedMessage {...messages.clubPortalMembersAddMember} />
            </Button>
          </div>
        )}
      </Card>

      {selectedMember && (
        <Card
          aria-label={intl.formatMessage(messages.clubPortalMembersEditHeading)}
          className="cl-chamfer cl-chamfer--control"
        >
          <header className="cl-card__header">
            <h2 className="cl-card__title">
              <FormattedMessage {...messages.clubPortalMembersEditHeading} />
            </h2>
          </header>

          <div className="cl-card__content">
            <div className="cl-platform-form-grid">
              <Field
                id="edit-member-name"
                label={intl.formatMessage(messages.clubPortalMembersName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.clubPortalMembersName)}
                  id="edit-member-name"
                  onChange={(event) => setEditDisplayName(event.target.value)}
                  value={editDisplayName}
                />
              </Field>
              <Field
                id="edit-member-alias"
                label={intl.formatMessage(messages.clubPortalMembersAlias)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.clubPortalMembersAlias)}
                  id="edit-member-alias"
                  onChange={(event) => setEditAlias(event.target.value)}
                  value={editAlias}
                />
              </Field>
              <Button onClick={() => void saveMember()} type="button">
                <FormattedMessage {...messages.clubPortalMembersSaveChanges} />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );

  return <ListScreenLayout listing={listingNode} title={titleNode} />;
}
