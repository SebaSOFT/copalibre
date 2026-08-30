import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import type {
  ClubResponse,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationRoleResponse,
  PendingOrganizationInvitationResponse,
  TournamentResponse,
} from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';
import { Button } from './ui/atoms/button.js';
import { Input } from './ui/atoms/input.js';
import { FormField } from './ui/molecules/form-field.js';
import { ListScreenTemplate } from './ui/templates/list-screen-template.js';
import { DataTable, type DataTableColumn } from './ui/organisms/data-table.js';
import { Modal } from './ui/organisms/modal.js';
import { EntityIdentityCell } from './ui/molecules/entity-identity-cell.js';
import { useToast } from './ToastProvider.js';

const ROLE_LABEL: Record<OrganizationRole, MessageDescriptor> = {
  admin: messages.rolesRoleAdmin,
  'club-admin': messages.rolesRoleClubAdmin,
  'tournament-admin': messages.rolesRoleTournamentAdmin,
  referee: messages.rolesRoleReferee,
  broadcaster: messages.rolesRoleBroadcaster,
  viewer: messages.rolesRoleViewer,
};

/** Every role this taxonomy declares, matching a super-admin's full grantable set. */
const ALL_ROLES: readonly OrganizationRole[] = [
  'admin',
  'club-admin',
  'tournament-admin',
  'referee',
  'broadcaster',
  'viewer',
];

export function RolesPermissionsPage({
  organizationAlias,
  rows,
  loading,
  error,
  grantableRoles,
  clubs,
  tournaments,
  pendingInvitations,
  onChange,
  onDelete,
  onInvite,
  onRescindInvitation,
}: {
  readonly organizationAlias: string;
  readonly rows: readonly OrganizationRoleResponse[];
  readonly loading: boolean;
  readonly error?: string;
  /**
   * Roles the caller may assign, per the role-granting hierarchy.
   * Undefined means "not yet known/not filtered" — every role is shown, matching
   * this component's previous behavior so a caller without the new endpoint
   * wired up still sees the full picker.
   */
  readonly grantableRoles?: readonly OrganizationRole[];
  /** Clubs in this organization, for the club-admin invite picker. Empty until loaded. */
  readonly clubs?: readonly ClubResponse[];
  /** Tournaments in this organization, for the tournament-admin invite picker. Empty until loaded. */
  readonly tournaments?: readonly TournamentResponse[];
  /** Invitations not yet accepted, not rescinded, not expired (openspec 0170). */
  readonly pendingInvitations?: readonly PendingOrganizationInvitationResponse[];
  readonly onChange: (
    assignmentId: string,
    role: OrganizationRole,
    status: OrganizationMemberStatus,
  ) => Promise<void>;
  readonly onDelete: (assignmentId: string) => Promise<void>;
  readonly onInvite: (
    email: string,
    role: OrganizationRole,
    status: OrganizationMemberStatus,
    scope?: { readonly clubId?: string; readonly tournamentId?: string },
  ) => Promise<void>;
  readonly onRescindInvitation?: (invitationId: string) => Promise<void>;
}): React.JSX.Element {
  const assignableRoles = grantableRoles ?? ALL_ROLES;
  const activeAdminCount = rows.filter(
    (row) => row.role === 'admin' && row.status === 'active',
  ).length;
  const intl = useIntl();
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState<string>();

  // A load/action failure is an operation result, not an in-progress field
  // validation problem — it belongs to the toast mechanism, never a
  // screen-local alert (design.md Decision 6). The `error` prop (a load
  // failure surfaced by the owning route) is reported the same way.
  useEffect(() => {
    if (error) toast.push({ severity: 'error', message: error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key);
    try {
      await action();
    } catch (cause) {
      toast.push({
        severity: 'error',
        message:
          cause instanceof Error ? cause.message : intl.formatMessage(messages.rolesChangeFailed),
      });
    } finally {
      setBusy(undefined);
    }
  };

  const columns: readonly DataTableColumn<OrganizationRoleResponse>[] = [
    {
      key: 'user',
      header: <FormattedMessage {...messages.rolesColumnUser} />,
      render: (row) => <EntityIdentityCell email={row.email} id={row.principalId} />,
    },
    {
      key: 'role',
      header: <FormattedMessage {...messages.rolesColumnRole} />,
      render: (row) => (
        <RoleSelect
          assignableRoles={assignableRoles}
          disabled={busy === row.assignmentId || isLastActiveAdmin(row, activeAdminCount)}
          isLastActiveAdmin={isLastActiveAdmin(row, activeAdminCount)}
          onChange={(role) =>
            run(row.assignmentId, () => onChange(row.assignmentId, role, row.status))
          }
          row={row}
        />
      ),
    },
    {
      key: 'status',
      header: <FormattedMessage {...messages.rolesColumnStatus} />,
      render: (row) => (
        <RoleStatusToggle
          disabled={busy === row.assignmentId || isLastActiveAdmin(row, activeAdminCount)}
          isLastActiveAdmin={isLastActiveAdmin(row, activeAdminCount)}
          onChange={(status) =>
            run(row.assignmentId, () => onChange(row.assignmentId, row.role, status))
          }
          row={row}
        />
      ),
    },
    {
      key: 'actions',
      header: <FormattedMessage {...messages.rolesColumnActions} />,
      render: (row) => (
        <RoleDeleteButton
          disabled={busy === row.assignmentId || isLastActiveAdmin(row, activeAdminCount)}
          isLastActiveAdmin={isLastActiveAdmin(row, activeAdminCount)}
          onDelete={() => run(row.assignmentId, () => onDelete(row.assignmentId))}
          row={row}
        />
      ),
    },
  ];

  return (
    <>
      <ListScreenTemplate
        breadcrumb={intl.formatMessage(messages.rolesBreadcrumb, { organizationAlias })}
        listing={
          loading ? (
            <p className="cl-list-screen__empty">
              <FormattedMessage {...messages.rolesLoading} />
            </p>
          ) : (
            <DataTable
              columns={columns}
              emptyMessage={intl.formatMessage(messages.rolesEmpty)}
              rowKey={(row) => row.assignmentId}
              rows={rows}
            />
          )
        }
        title={<FormattedMessage {...messages.rolesTitle} />}
        toolbar={
          <Button onClick={() => setInviteOpen(true)} type="button">
            <FormattedMessage {...messages.rolesAddRecipient} />
          </Button>
        }
      />
      {pendingInvitations !== undefined && (
        <section aria-label={intl.formatMessage(messages.rolesPendingInvitationsTitle)}>
          <h2>
            <FormattedMessage {...messages.rolesPendingInvitationsTitle} />
          </h2>
          {pendingInvitations.length === 0 ? (
            <p className="cl-list-screen__empty">
              <FormattedMessage {...messages.rolesPendingInvitationsEmpty} />
            </p>
          ) : (
            <ul>
              {pendingInvitations.map((invitation) => (
                <li key={invitation.invitationId}>
                  <span>{invitation.recipientEmail}</span> —{' '}
                  <span>{intl.formatMessage(ROLE_LABEL[invitation.role])}</span>
                  <Button
                    aria-label={intl.formatMessage(messages.rolesRescindInvitationOf, {
                      email: invitation.recipientEmail,
                    })}
                    disabled={busy === invitation.invitationId || !onRescindInvitation}
                    onClick={() =>
                      run(invitation.invitationId, () =>
                        onRescindInvitation
                          ? onRescindInvitation(invitation.invitationId)
                          : Promise.resolve(),
                      )
                    }
                    type="button"
                    variant="destructive-outline"
                  >
                    <FormattedMessage {...messages.rolesRescindInvitation} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <InviteDialog
        assignableRoles={assignableRoles}
        busy={busy === 'invite'}
        clubs={clubs ?? []}
        onClose={() => setInviteOpen(false)}
        onSubmit={(email, role, status, scope) =>
          run('invite', async () => {
            await onInvite(email, role, status, scope);
            setInviteOpen(false);
          })
        }
        open={inviteOpen}
        tournaments={tournaments ?? []}
      />
    </>
  );

  function isLastActiveAdmin(row: OrganizationRoleResponse, count: number): boolean {
    return row.role === 'admin' && row.status === 'active' && count <= 1;
  }
}

function RoleSelect({
  row,
  assignableRoles,
  disabled,
  isLastActiveAdmin,
  onChange,
}: {
  readonly row: OrganizationRoleResponse;
  readonly assignableRoles: readonly OrganizationRole[];
  readonly disabled: boolean;
  readonly isLastActiveAdmin: boolean;
  readonly onChange: (role: OrganizationRole) => void;
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <select
      aria-label={intl.formatMessage(messages.rolesRoleOf, { email: row.email })}
      className="cl-select cl-select--default cl-focusable"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as OrganizationRole)}
      title={
        isLastActiveAdmin ? intl.formatMessage(messages.rolesLastActiveAdminNotice) : undefined
      }
      value={row.role}
    >
      {(assignableRoles.includes(row.role) ? assignableRoles : [row.role, ...assignableRoles]).map(
        (role) => (
          <option key={role} value={role}>
            {intl.formatMessage(ROLE_LABEL[role])}
          </option>
        ),
      )}
    </select>
  );
}

function RoleStatusToggle({
  row,
  disabled,
  isLastActiveAdmin,
  onChange,
}: {
  readonly row: OrganizationRoleResponse;
  readonly disabled: boolean;
  readonly isLastActiveAdmin: boolean;
  readonly onChange: (status: OrganizationMemberStatus) => void;
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <label className="cl-role-status">
      <input
        aria-label={intl.formatMessage(messages.rolesStatusOf, { email: row.email })}
        checked={row.status === 'active'}
        className="cl-checkbox cl-focusable"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked ? 'active' : 'inactive')}
        title={
          isLastActiveAdmin ? intl.formatMessage(messages.rolesLastActiveAdminNotice) : undefined
        }
        type="checkbox"
      />
      <span
        className={row.status === 'active' ? 'cl-role-status--active' : 'cl-role-status--inactive'}
      >
        {row.status === 'active'
          ? intl.formatMessage(messages.rolesActive)
          : intl.formatMessage(messages.rolesInactive)}
      </span>
    </label>
  );
}

function RoleDeleteButton({
  row,
  disabled,
  isLastActiveAdmin,
  onDelete,
}: {
  readonly row: OrganizationRoleResponse;
  readonly disabled: boolean;
  readonly isLastActiveAdmin: boolean;
  readonly onDelete: () => void;
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <Button
      aria-label={intl.formatMessage(messages.rolesDeleteOf, { email: row.email })}
      disabled={disabled}
      onClick={onDelete}
      title={
        isLastActiveAdmin ? intl.formatMessage(messages.rolesLastActiveAdminNotice) : undefined
      }
      type="button"
      variant="destructive-outline"
    >
      <FormattedMessage {...messages.rolesDelete} />
    </Button>
  );
}

export function InviteDialog({
  open,
  busy,
  assignableRoles,
  clubs,
  tournaments,
  onClose,
  onSubmit,
}: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly assignableRoles: readonly OrganizationRole[];
  /** Clubs in this organization; the club-admin picker lists only these. */
  readonly clubs: readonly ClubResponse[];
  /** Tournaments in this organization; the tournament-admin picker lists only these. */
  readonly tournaments: readonly TournamentResponse[];
  readonly onClose: () => void;
  readonly onSubmit: (
    email: string,
    role: OrganizationRole,
    status: OrganizationMemberStatus,
    scope?: { readonly clubId?: string; readonly tournamentId?: string },
  ) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>(
    assignableRoles.includes('viewer') ? 'viewer' : (assignableRoles[0] ?? 'viewer'),
  );
  const [active, setActive] = useState(true);
  const [clubId, setClubId] = useState<string>('');
  const [tournamentId, setTournamentId] = useState<string>('');
  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            <FormattedMessage {...messages.rolesInviteDialogCancel} />
          </Button>
          <Button
            disabled={
              busy ||
              (role === 'club-admin' && clubId === '') ||
              (role === 'tournament-admin' && tournamentId === '')
            }
            form="invite-dialog-form"
            type="submit"
          >
            <FormattedMessage {...messages.rolesInviteDialogSubmit} />
          </Button>
        </>
      }
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open={open}
      title={intl.formatMessage(messages.rolesAddRecipient)}
    >
      <form
        id="invite-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(email, role, active ? 'active' : 'inactive', {
            ...(role === 'club-admin' ? { clubId } : {}),
            ...(role === 'tournament-admin' ? { tournamentId } : {}),
          });
        }}
      >
        <FormField id="invite-email" label={intl.formatMessage(messages.rolesInviteDialogEmail)}>
          <Input
            aria-label={intl.formatMessage(messages.rolesInviteDialogEmail)}
            id="invite-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </FormField>
        <FormField id="invite-role" label={intl.formatMessage(messages.rolesInviteDialogRole)}>
          <select
            aria-label={intl.formatMessage(messages.rolesInviteDialogRoleAriaLabel)}
            className="cl-select cl-select--default cl-focusable"
            id="invite-role"
            onChange={(event) => setRole(event.target.value as OrganizationRole)}
            value={role}
          >
            {assignableRoles.map((one) => (
              <option key={one} value={one}>
                {intl.formatMessage(ROLE_LABEL[one])}
              </option>
            ))}
          </select>
        </FormField>
        {role === 'club-admin' && (
          <FormField id="invite-club" label={intl.formatMessage(messages.rolesInviteDialogClub)}>
            <select
              aria-label={intl.formatMessage(messages.rolesInviteDialogClubAriaLabel)}
              className="cl-select cl-select--default cl-focusable"
              id="invite-club"
              onChange={(event) => setClubId(event.target.value)}
              required
              value={clubId}
            >
              <option value="" />
              {clubs.map((club) => (
                <option key={club.clubId} value={club.clubId}>
                  {club.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {role === 'tournament-admin' && (
          <FormField
            id="invite-tournament"
            label={intl.formatMessage(messages.rolesInviteDialogTournament)}
          >
            <select
              aria-label={intl.formatMessage(messages.rolesInviteDialogTournamentAriaLabel)}
              className="cl-select cl-select--default cl-focusable"
              id="invite-tournament"
              onChange={(event) => setTournamentId(event.target.value)}
              required
              value={tournamentId}
            >
              <option value="" />
              {tournaments.map((tournament) => (
                <option key={tournament.tournamentId} value={tournament.tournamentId}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <label className="cl-toggle cl-focusable">
          <input
            checked={active}
            className="cl-checkbox cl-focusable"
            onChange={(event) => setActive(event.target.checked)}
            type="checkbox"
          />
          <span>
            <FormattedMessage {...messages.rolesInviteDialogActiveOnAccept} />
          </span>
        </label>
      </form>
    </Modal>
  );
}
