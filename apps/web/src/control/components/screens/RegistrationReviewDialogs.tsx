import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '../ui/atoms/button.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { Form } from '../ui/atoms/form.js';
import { Field } from '../ui/molecules/field.js';
import { Modal } from '../ui/organisms/modal.js';
import type { PlayerRole } from '@copalibre/domain';
import { RosterRoleSelector, type RosterMemberItem } from '../RosterRoleSelector.js';
import { messages } from '../../i18n/messages.en.js';
import { type ReviewRegistrationRow } from './registration-review-model.js';

export type ParticipantKind = 'person' | 'team';

export function AddParticipantDialog({
  open,
  onClose,
  onSubmit,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    readonly kind: ParticipantKind;
    readonly name: string;
    readonly alias?: string;
  }) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [kind, setKind] = useState<ParticipantKind>('person');
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const reset = (): void => {
    setKind('person');
    setName('');
    setAlias('');
    setError(undefined);
  };

  return (
    <Modal
      closeLabel={intl.formatMessage(messages.registrationModalClose)}
      footer={
        <>
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
            type="button"
            variant="secondary"
          >
            <FormattedMessage {...messages.reviewAddParticipantCancel} />
          </Button>
          <Button disabled={busy || name.trim() === ''} form="add-participant-form" type="submit">
            <FormattedMessage {...messages.reviewAddParticipantSubmit} />
          </Button>
        </>
      }
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
      open={open}
      title={intl.formatMessage(messages.reviewAddParticipantTitle)}
    >
      <Form
        id="add-participant-form"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          void onSubmit({
            kind,
            name: name.trim(),
            ...(alias.trim() === '' ? {} : { alias: alias.trim() }),
          })
            .then(() => {
              reset();
              onClose();
            })
            .catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : String(cause)),
            )
            .finally(() => setBusy(false));
        }}
      >
        <Field
          id="add-participant-kind"
          label={intl.formatMessage(messages.reviewParticipantKindLabel)}
        >
          <Select
            aria-label={intl.formatMessage(messages.reviewParticipantKindLabel)}
            id="add-participant-kind"
            onValueChange={(value) => setKind(value as ParticipantKind)}
            options={[
              { value: 'person', label: intl.formatMessage(messages.reviewParticipantKindPerson) },
              { value: 'team', label: intl.formatMessage(messages.reviewParticipantKindTeam) },
            ]}
            value={kind}
          />
        </Field>
        <Field
          id="add-participant-name"
          label={intl.formatMessage(messages.reviewParticipantNameLabel)}
        >
          <Input
            aria-label={intl.formatMessage(messages.reviewParticipantNameLabel)}
            id="add-participant-name"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </Field>
        <Field
          id="add-participant-alias"
          label={intl.formatMessage(messages.reviewParticipantAliasLabel)}
        >
          <Input
            aria-label={intl.formatMessage(messages.reviewParticipantAliasLabel)}
            id="add-participant-alias"
            onChange={(event) => setAlias(event.target.value)}
            value={alias}
          />
        </Field>
        {error !== undefined && <Alert tone="destructive">{error}</Alert>}
      </Form>
    </Modal>
  );
}

export function EditIdentityDialog({
  row,
  onClose,
  onSubmit,
}: {
  readonly row: ReviewRegistrationRow;
  readonly onClose: () => void;
  readonly onSubmit: (name: string, alias?: string) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [name, setName] = useState(row.displayName);
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <Modal
      closeLabel={intl.formatMessage(messages.registrationModalClose)}
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            <FormattedMessage {...messages.reviewEditIdentityCancel} />
          </Button>
          <Button disabled={busy || name.trim() === ''} form="edit-identity-form" type="submit">
            <FormattedMessage {...messages.reviewEditIdentitySave} />
          </Button>
        </>
      }
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
      title={intl.formatMessage(messages.reviewEditIdentityTitle)}
    >
      <Form
        id="edit-identity-form"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          void onSubmit(name.trim(), alias.trim() === '' ? undefined : alias.trim())
            .then(onClose)
            .catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : String(cause)),
            )
            .finally(() => setBusy(false));
        }}
      >
        <Field
          id="edit-identity-name"
          label={intl.formatMessage(messages.reviewParticipantNameLabel)}
        >
          <Input
            aria-label={intl.formatMessage(messages.reviewParticipantNameLabel)}
            id="edit-identity-name"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </Field>
        <Field
          id="edit-identity-alias"
          label={intl.formatMessage(messages.reviewParticipantAliasLabel)}
        >
          <Input
            aria-label={intl.formatMessage(messages.reviewParticipantAliasLabel)}
            id="edit-identity-alias"
            onChange={(event) => setAlias(event.target.value)}
            value={alias}
          />
        </Field>
        {error !== undefined && <Alert tone="destructive">{error}</Alert>}
      </Form>
    </Modal>
  );
}

export function LinkIdentityDialog({
  displayName,
  onClose,
  onSubmit,
}: {
  readonly displayName: string;
  readonly onClose: () => void;
  readonly onSubmit: (email: string) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <Modal
      closeLabel={intl.formatMessage(messages.registrationModalClose)}
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            <FormattedMessage {...messages.reviewLinkIdentityCancel} />
          </Button>
          <Button disabled={busy || email.trim() === ''} form="link-identity-form" type="submit">
            <FormattedMessage {...messages.reviewLinkIdentitySave} />
          </Button>
        </>
      }
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
      title={intl.formatMessage(messages.reviewLinkIdentityTitle, { displayName })}
    >
      <Form
        id="link-identity-form"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          void onSubmit(email.trim())
            .catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : String(cause)),
            )
            .finally(() => setBusy(false));
        }}
      >
        <Field
          id="link-identity-email"
          label={intl.formatMessage(messages.reviewLinkIdentityEmailLabel)}
        >
          <Input
            aria-label={intl.formatMessage(messages.reviewLinkIdentityEmailLabel)}
            id="link-identity-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </Field>
        {error !== undefined && <Alert tone="destructive">{error}</Alert>}
      </Form>
    </Modal>
  );
}

export function EditTeamMembersDialog({
  row,
  onClose,
  onSubmit,
}: {
  readonly row: ReviewRegistrationRow;
  readonly onClose: () => void;
  readonly onSubmit: (
    members: readonly { readonly personId: string; readonly role: PlayerRole }[],
  ) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const initialMembers: readonly RosterMemberItem[] =
    row.teamMembersDetailed && row.teamMembersDetailed.length > 0
      ? row.teamMembersDetailed.map((m) => ({
          personId: m.personId,
          displayName: m.displayName || intl.formatMessage(messages.matchConsoleUnnamedEntrant),
          role: m.role as PlayerRole,
          nationality: m.nationality,
          photoObjectId: m.photoObjectId,
        }))
      : row.teamMembers.map((name, idx) => ({
          personId: `member-${idx + 1}`,
          displayName: name,
          role: 'player' as PlayerRole,
        }));

  const [members, setMembers] = useState<readonly RosterMemberItem[]>(initialMembers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <Modal
      closeLabel={intl.formatMessage(messages.registrationModalClose)}
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            <FormattedMessage {...messages.reviewEditIdentityCancel} />
          </Button>
          <Button disabled={busy} form="edit-team-members-form" type="submit">
            <FormattedMessage {...messages.reviewSaveMembers} />
          </Button>
        </>
      }
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
      title={intl.formatMessage(messages.reviewEditMembersTitle)}
    >
      <Form
        id="edit-team-members-form"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(undefined);
          void onSubmit(members.map((m) => ({ personId: m.personId, role: m.role })))
            .then(onClose)
            .catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : String(cause)),
            )
            .finally(() => setBusy(false));
        }}
      >
        <p className="cl-decision-hint">
          <FormattedMessage
            {...messages.reviewEditMembersDescription}
            values={{ team: row.displayName }}
          />
        </p>
        <RosterRoleSelector disabled={busy} members={members} onChange={setMembers} />
        {error !== undefined && <Alert tone="destructive">{error}</Alert>}
      </Form>
    </Modal>
  );
}
