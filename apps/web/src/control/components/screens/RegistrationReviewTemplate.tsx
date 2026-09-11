import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { FilePicker } from '../ui/atoms/file-picker.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { Field } from '../ui/molecules/field.js';
import { CountrySelect } from '../CountrySelect.js';
import {
  personPhotoUrl,
  type BulkReviewRequest,
  type CreatePersonRequest,
  type CreateTeamRequest,
  type LinkParticipantIdentityRequest,
  type ReviewRegistrationRequest,
  type UpdatePersonIdentityRequest,
  type UpdateTeamIdentityRequest,
  type UploadImageRequest,
} from '../../lib/api-client.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { countryFlag } from '../../lib/country.js';
import { FramedImage } from '../FramedImage.js';
import { ImageCropModal } from '../ImageCropModal.js';
import { PersonPhotoPlaceholder } from '../placeholders.js';
import { FieldValue } from '../ui/molecules/field-value.js';
import { Modal } from '../ui/organisms/modal.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';
import type { PlayerRole } from '@copalibre/domain';
import {
  RosterRoleSelector,
  type RosterMemberItem,
  rosterRoleLabel,
  ROSTER_ROLE_ACCENTS,
} from '../RosterRoleSelector.js';
import type { TeamMemberResponse } from '../../lib/api-client.js';
import {
  LOCK_EXPLANATION,
  initialReview,
  pageCount,
  teamMembershipActionsEnabled,
  setFilter,
  toggleAllVisible,
  toggleRow,
  visibleRows,
  type RegistrationRow,
  type StatusFilter,
} from '../../lib/review.js';
import { messages } from '../../i18n/messages.en.js';

export interface ReviewRegistrationRow extends RegistrationRow {
  readonly contactEmail: string;
  readonly teamMembers: readonly string[];
  readonly teamMembersDetailed?: readonly TeamMemberResponse[];
  readonly experience: string;
  readonly requiresCheckIn: boolean;
  readonly checkInClosesAt?: string;
}

const FILTERS: readonly { readonly value: StatusFilter; readonly label: MessageDescriptor }[] = [
  { value: 'all', label: messages.reviewFilterAll },
  { value: 'pending', label: messages.reviewFilterPending },
  { value: 'accepted', label: messages.reviewFilterAccepted },
  { value: 'refused', label: messages.reviewFilterRefused },
];

const STATUS_LABELS: Record<RegistrationRow['status'], MessageDescriptor> = {
  pending: messages.reviewStatusPending,
  accepted: messages.reviewStatusAccepted,
  refused: messages.reviewStatusRefused,
  withdrawn: messages.reviewStatusWithdrawn,
  'checked-in': messages.reviewStatusCheckedIn,
};

export function RegistrationReviewTemplate({
  organizationAlias,
  tournamentName,
  rows,
  now,
  onBulkReview,
  onReview,
  onSetNationality,
  onUploadPhoto,
  onAddPerson,
  onAddTeam,
  onEditPersonIdentity,
  onEditTeamIdentity,
  onLinkIdentity,
  onUnlinkIdentity,
  onEditTeamMembers,
}: {
  readonly organizationAlias: string;
  readonly tournamentName: string;
  readonly rows: readonly ReviewRegistrationRow[];
  readonly now: string;
  readonly onBulkReview?: (request: BulkReviewRequest) => Promise<void> | void;
  readonly onReview?: (
    entrantId: string,
    request: ReviewRegistrationRequest,
  ) => Promise<void> | void;
  /** Absent on a team-kind row; set only for a person entrant. */
  readonly onSetNationality?: (
    personId: string,
    nationality: string | null,
  ) => Promise<void> | void;
  readonly onUploadPhoto?: (personId: string, request: UploadImageRequest) => Promise<void> | void;
  readonly onAddPerson?: (request: CreatePersonRequest) => Promise<void> | void;
  readonly onAddTeam?: (request: CreateTeamRequest) => Promise<void> | void;
  readonly onEditPersonIdentity?: (
    personId: string,
    request: UpdatePersonIdentityRequest,
  ) => Promise<void> | void;
  readonly onEditTeamIdentity?: (
    teamId: string,
    request: UpdateTeamIdentityRequest,
  ) => Promise<void> | void;
  readonly onLinkIdentity?: (
    personId: string,
    request: LinkParticipantIdentityRequest,
  ) => Promise<void> | void;
  readonly onUnlinkIdentity?: (personId: string) => Promise<void> | void;
  readonly onEditTeamMembers?: (
    entrantId: string,
    members: readonly { readonly personId: string; readonly role?: PlayerRole }[],
  ) => Promise<void> | void;
}): React.JSX.Element {
  const intl = useIntl();
  const [state, setState] = useState(() => initialReview(10));
  const [nationalityDraft, setNationalityDraft] = useState<Record<string, string>>({});
  const [photoCrop, setPhotoCrop] = useState<{ personId: string; src: string } | undefined>(
    undefined,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ReviewRegistrationRow | undefined>(undefined);
  const [linkingRow, setLinkingRow] = useState<ReviewRegistrationRow | undefined>(undefined);
  const [editingMembersRow, setEditingMembersRow] = useState<ReviewRegistrationRow | undefined>(
    undefined,
  );
  const visible = visibleRows(rows, state) as readonly ReviewRegistrationRow[];
  const selected = new Set(state.selected);
  const allVisibleSelected =
    visible.length > 0 && visible.every((row) => state.selected.includes(row.entrantId));

  const breadcrumbNode = (
    <span>
      {organizationAlias} &gt; {tournamentName}
    </span>
  );

  const titleNode = <FormattedMessage {...messages.reviewTitle} />;

  const toolbarNode = (
    <div className="cl-table-toolbar">
      <div className="cl-table-toolbar__filters">
        <Select
          aria-label={intl.formatMessage(messages.reviewStatusFieldLabel)}
          onValueChange={(value) =>
            setState((current) => setFilter(current, value as StatusFilter, rows))
          }
          options={FILTERS.map((filter) => ({
            value: filter.value,
            label: intl.formatMessage(filter.label),
          }))}
          value={state.filter}
        />
      </div>
      <div className="cl-table-toolbar__actions">
        <Button onClick={() => setAddOpen(true)} type="button">
          <FormattedMessage {...messages.reviewAddParticipant} />
        </Button>
        <Button
          disabled={state.selected.length === 0}
          onClick={() => void onBulkReview?.({ entrantIds: state.selected, decision: 'accepted' })}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.reviewApprove} />
        </Button>
        <Button
          disabled={state.selected.length === 0}
          onClick={() => void onBulkReview?.({ entrantIds: state.selected, decision: 'refused' })}
          type="button"
          variant="destructive-outline"
        >
          <FormattedMessage {...messages.reviewRefuse} />
        </Button>
        <Button type="button">
          <FormattedMessage {...messages.reviewExport} />
        </Button>
      </div>
    </div>
  );

  const listingNode = (
    <div
      aria-label={intl.formatMessage(messages.reviewSectionLabel)}
      className="cl-data-table"
      role="region"
      tabIndex={0}
    >
      <div className="cl-role-user">
        <Checkbox
          aria-label={intl.formatMessage(messages.reviewSelectVisible)}
          checked={allVisibleSelected}
          onCheckedChange={() => setState((current) => toggleAllVisible(current, rows))}
        />
        <span>
          <FormattedMessage {...messages.reviewColumnName} />
        </span>
        <span>
          <FormattedMessage {...messages.reviewColumnStatus} />
        </span>
        <span>
          <FormattedMessage {...messages.reviewColumnSubmitted} />
        </span>
      </div>
      {visible.map((row) => {
        const teamMembershipEnabled = teamMembershipActionsEnabled({
          requiresCheckIn: row.requiresCheckIn,
          checkInClosesAt: row.checkInClosesAt,
          status: row.status,
          now,
        });
        const personId = row.personId;
        return (
          <details className="cl-focusable" key={row.entrantId}>
            <summary className="cl-role-user">
              <Checkbox
                aria-label={intl.formatMessage(messages.reviewSelectRow, {
                  displayName: row.displayName,
                })}
                checked={selected.has(row.entrantId)}
                onCheckedChange={() => setState((current) => toggleRow(current, row.entrantId))}
                onClick={(event: React.MouseEvent) => event.stopPropagation()}
              />
              <span>
                <strong>
                  {row.nationality !== undefined && (
                    <span aria-hidden="true">{countryFlag(row.nationality)} </span>
                  )}
                  {row.displayName}
                </strong>
                <small className="cl-label">
                  {intl.formatMessage(messages.reviewIdLabel, { entrantId: row.entrantId })}
                </small>
              </span>
              <span className="cl-badge">{intl.formatMessage(STATUS_LABELS[row.status])}</span>
              <time className="cl-label" dateTime={row.submittedAt}>
                {row.submittedAt}
              </time>
            </summary>
            <div className="cl-card__content">
              <FieldValue
                label={intl.formatMessage(messages.reviewContact)}
                value={row.contactEmail}
              />
              <div className="cl-review-team-roster">
                <span className="cl-label">
                  <FormattedMessage {...messages.reviewTeamMembers} />
                </span>
                {row.teamMembersDetailed && row.teamMembersDetailed.length > 0 ? (
                  <ul
                    className="cl-roster-badge-list"
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 'var(--cl-space-2) 0',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 'var(--cl-space-2)',
                    }}
                  >
                    {row.teamMembersDetailed.map((member) => (
                      <li
                        key={member.personId}
                        className="cl-roster-badge-item"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--cl-space-1)',
                        }}
                      >
                        <span>{member.displayName || member.personId}</span>
                        <span
                          className={`cl-badge ${ROSTER_ROLE_ACCENTS[member.role as PlayerRole] ?? 'cl-state--muted'}`}
                          data-testid={`role-badge-${member.personId}`}
                        >
                          {rosterRoleLabel(member.role as PlayerRole, intl)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 'var(--cl-space-1) 0' }}>
                    {row.teamMembers.length === 0
                      ? intl.formatMessage(messages.reviewTeamMembersUnavailable)
                      : row.teamMembers.join(', ')}
                  </p>
                )}
              </div>
              <FieldValue
                label={intl.formatMessage(messages.reviewExperience)}
                value={row.experience}
              />
              {personId !== undefined && (
                <Card className="cl-chamfer cl-chamfer--control">
                  <span className="cl-label">
                    {intl.formatMessage(messages.reviewNationalityLabel)}
                  </span>
                  <CountrySelect
                    onChange={(code) =>
                      setNationalityDraft((current) => ({ ...current, [personId]: code }))
                    }
                    value={nationalityDraft[personId] ?? row.nationality}
                  />
                  <Button
                    onClick={() =>
                      void onSetNationality?.(
                        personId,
                        nationalityDraft[personId] ?? row.nationality ?? null,
                      )
                    }
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.reviewSaveNationality} />
                  </Button>
                  <FramedImage
                    alt={intl.formatMessage(messages.reviewUploadPhoto)}
                    placeholder={
                      <PersonPhotoPlaceholder
                        size={64}
                        title={intl.formatMessage(messages.reviewUploadPhoto)}
                      />
                    }
                    size={64}
                    src={
                      row.photoObjectId !== undefined
                        ? personPhotoUrl(organizationAlias, personId)
                        : undefined
                    }
                  />
                  <FilePicker
                    accept="image/*"
                    aria-label={intl.formatMessage(messages.reviewUploadPhoto)}
                    id={`review-photo-${personId}`}
                    label={intl.formatMessage(messages.reviewUploadPhoto)}
                    onChange={(files) => {
                      const file = files?.[0];
                      if (!file) return;
                      setPhotoCrop({ personId, src: URL.createObjectURL(file) });
                    }}
                  />
                  <a
                    className="cl-focusable"
                    href={`/control/${organizationAlias}/persons/${personId}`}
                    onClick={controlLinkClick(`/control/${organizationAlias}/persons/${personId}`)}
                  >
                    <FormattedMessage {...messages.reviewViewProfile} />
                  </a>
                </Card>
              )}
              <div className="cl-role-user">
                <Button type="button" variant="secondary">
                  <FormattedMessage {...messages.reviewMessage} />
                </Button>
                {(row.teamId !== undefined ||
                  row.teamMembers.length > 0 ||
                  (row.teamMembersDetailed && row.teamMembersDetailed.length > 0)) && (
                  <Button
                    disabled={!teamMembershipEnabled}
                    onClick={() => setEditingMembersRow(row)}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.reviewEditMembers} />
                  </Button>
                )}
                {(row.personId !== undefined || row.teamId !== undefined) && (
                  <Button onClick={() => setEditingRow(row)} type="button" variant="secondary">
                    <FormattedMessage {...messages.reviewEditIdentity} />
                  </Button>
                )}
                {row.personId !== undefined &&
                  (row.hasIdentityLink ? (
                    <Button
                      onClick={() => void onUnlinkIdentity?.(row.personId as string)}
                      type="button"
                      variant="destructive-outline"
                    >
                      <FormattedMessage {...messages.reviewUnlinkIdentity} />
                    </Button>
                  ) : (
                    <Button onClick={() => setLinkingRow(row)} type="button" variant="secondary">
                      <FormattedMessage {...messages.reviewLinkIdentity} />
                    </Button>
                  ))}
                <Button
                  onClick={() =>
                    void onReview?.(row.entrantId, {
                      decision: 'withdrawn',
                      reason: 'Revoked from registration review',
                    })
                  }
                  type="button"
                  variant="destructive-outline"
                >
                  <FormattedMessage {...messages.reviewRevoke} />
                </Button>
              </div>
              {!teamMembershipEnabled && (
                <Alert tone="info">{intl.formatMessage(LOCK_EXPLANATION)}</Alert>
              )}
            </div>
          </details>
        );
      })}
      {visible.length === 0 && (
        <p className="cl-card__description">
          <FormattedMessage {...messages.reviewEmptyFilter} />
        </p>
      )}
    </div>
  );

  const paginationNode = (
    <span>
      {intl.formatMessage(messages.reviewPagination, {
        page: state.page,
        pageCount: pageCount(rows, state),
      })}
    </span>
  );

  return (
    <>
      <ListScreenLayout
        breadcrumb={breadcrumbNode}
        listing={listingNode}
        pagination={paginationNode}
        title={titleNode}
        toolbar={toolbarNode}
      />

      {photoCrop !== undefined && (
        <ImageCropModal
          imageSrc={photoCrop.src}
          onCancel={() => {
            URL.revokeObjectURL(photoCrop.src);
            setPhotoCrop(undefined);
          }}
          onConfirm={(output) => {
            URL.revokeObjectURL(photoCrop.src);
            const personId = photoCrop.personId;
            setPhotoCrop(undefined);
            void onUploadPhoto?.(personId, {
              filename: 'photo.png',
              contentType: output.contentType,
              contentBase64: output.contentBase64,
            });
          }}
        />
      )}

      <AddParticipantDialog
        onClose={() => setAddOpen(false)}
        onSubmit={async (input) => {
          if (input.kind === 'person') {
            await onAddPerson?.({
              displayName: input.name,
              ...(input.alias === undefined ? {} : { alias: input.alias }),
            });
          } else {
            await onAddTeam?.({
              name: input.name,
              ...(input.alias === undefined ? {} : { alias: input.alias }),
            });
          }
        }}
        open={addOpen}
      />

      {editingRow !== undefined && (
        <EditIdentityDialog
          key={editingRow.entrantId}
          onClose={() => setEditingRow(undefined)}
          onSubmit={async (name, alias) => {
            if (editingRow.personId !== undefined) {
              await onEditPersonIdentity?.(editingRow.personId, {
                ...(name === editingRow.displayName ? {} : { displayName: name }),
                ...(alias === undefined ? {} : { alias }),
              });
            } else if (editingRow.teamId !== undefined) {
              await onEditTeamIdentity?.(editingRow.teamId, {
                ...(name === editingRow.displayName ? {} : { name }),
                ...(alias === undefined ? {} : { alias }),
              });
            }
          }}
          row={editingRow}
        />
      )}

      {linkingRow !== undefined && linkingRow.personId !== undefined && (
        <LinkIdentityDialog
          displayName={linkingRow.displayName}
          key={linkingRow.entrantId}
          onClose={() => setLinkingRow(undefined)}
          onSubmit={async (email) => {
            await onLinkIdentity?.(linkingRow.personId as string, { email });
            setLinkingRow(undefined);
          }}
        />
      )}

      {editingMembersRow !== undefined && (
        <EditTeamMembersDialog
          key={editingMembersRow.entrantId}
          onClose={() => setEditingMembersRow(undefined)}
          onSubmit={async (members) => {
            await onEditTeamMembers?.(editingMembersRow.entrantId, members);
            setEditingMembersRow(undefined);
          }}
          row={editingMembersRow}
        />
      )}
    </>
  );
}

type ParticipantKind = 'person' | 'team';

function AddParticipantDialog({
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
      <form
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
      </form>
    </Modal>
  );
}

function EditIdentityDialog({
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
      <form
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
      </form>
    </Modal>
  );
}

function LinkIdentityDialog({
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
      <form
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
      </form>
    </Modal>
  );
}

function EditTeamMembersDialog({
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
          displayName: m.displayName || m.personId,
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
      <form
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
      </form>
    </Modal>
  );
}
