import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import type {
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationRoleResponse,
} from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';
import { Button } from './ui/atoms/button.js';
import { ListScreenTemplate } from './ui/templates/list-screen-template.js';
import { DataTable, type DataTableColumn } from './ui/organisms/data-table.js';
import { Modal } from './ui/organisms/modal.js';
import { EntityIdentityCell } from './ui/molecules/entity-identity-cell.js';
import { useToast } from './ToastProvider.js';

const ROLE_LABEL: Record<OrganizationRole, MessageDescriptor> = {
  admin: messages.rolesRoleAdmin,
  'club-admin': messages.rolesRoleClubAdmin,
  referee: messages.rolesRoleReferee,
  broadcaster: messages.rolesRoleBroadcaster,
  viewer: messages.rolesRoleViewer,
};

/** Every role this taxonomy declares, matching a super-admin's full grantable set. */
const ALL_ROLES: readonly OrganizationRole[] = [
  'admin',
  'club-admin',
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
  onChange,
  onDelete,
  onInvite,
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
  ) => Promise<void>;
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
      <InviteDialog
        assignableRoles={assignableRoles}
        busy={busy === 'invite'}
        onClose={() => setInviteOpen(false)}
        onSubmit={(email, role, status) =>
          run('invite', async () => {
            await onInvite(email, role, status);
            setInviteOpen(false);
          })
        }
        open={inviteOpen}
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
  onClose,
  onSubmit,
}: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly assignableRoles: readonly OrganizationRole[];
  readonly onClose: () => void;
  readonly onSubmit: (
    email: string,
    role: OrganizationRole,
    status: OrganizationMemberStatus,
  ) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>(
    assignableRoles.includes('viewer') ? 'viewer' : (assignableRoles[0] ?? 'viewer'),
  );
  const [active, setActive] = useState(true);
  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            <FormattedMessage {...messages.rolesInviteDialogCancel} />
          </Button>
          <Button disabled={busy} form="invite-dialog-form" type="submit">
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
          void onSubmit(email, role, active ? 'active' : 'inactive');
        }}
      >
        <label className="cl-form-field">
          <FormattedMessage {...messages.rolesInviteDialogEmail} />
          <input
            className="cl-input cl-input--default cl-focusable"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <label className="cl-form-field">
          <FormattedMessage {...messages.rolesInviteDialogRole} />
          <select
            aria-label={intl.formatMessage(messages.rolesInviteDialogRoleAriaLabel)}
            className="cl-select cl-select--default cl-focusable"
            onChange={(event) => setRole(event.target.value as OrganizationRole)}
            value={role}
          >
            {assignableRoles.map((one) => (
              <option key={one} value={one}>
                {intl.formatMessage(ROLE_LABEL[one])}
              </option>
            ))}
          </select>
        </label>
        <label className="cl-role-status">
          <input
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            type="checkbox"
          />
          <FormattedMessage {...messages.rolesInviteDialogActiveOnAccept} />
        </label>
      </form>
    </Modal>
  );
}
