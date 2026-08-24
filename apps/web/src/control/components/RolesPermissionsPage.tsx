import { useState } from 'react';
import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import type {
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationRoleResponse,
} from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';

const ROLE_LABEL: Record<OrganizationRole, MessageDescriptor> = {
  admin: messages.rolesRoleAdmin,
  referee: messages.rolesRoleReferee,
  broadcaster: messages.rolesRoleBroadcaster,
  viewer: messages.rolesRoleViewer,
};

export function RolesPermissionsPage({
  organizationAlias,
  rows,
  loading,
  error,
  onChange,
  onDelete,
  onInvite,
}: {
  readonly organizationAlias: string;
  readonly rows: readonly OrganizationRoleResponse[];
  readonly loading: boolean;
  readonly error?: string;
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
  const intl = useIntl();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key);
    setActionError(undefined);
    try {
      await action();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : intl.formatMessage(messages.rolesChangeFailed),
      );
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section aria-label={intl.formatMessage(messages.rolesSectionLabel)} style={stackStyle}>
      <header style={headerStyle}>
        <div>
          <p style={metaStyle}>
            {intl.formatMessage(messages.rolesBreadcrumb, { organizationAlias })}
          </p>
          <h1 style={titleStyle}>
            <FormattedMessage {...messages.rolesTitle} />
          </h1>
        </div>
        <button
          className="cl-focusable"
          onClick={() => setInviteOpen(true)}
          style={addButtonStyle}
          type="button"
        >
          <FormattedMessage {...messages.rolesAddRecipient} />
        </button>
      </header>
      {error || actionError ? (
        <p className="cl-inline-alert" role="alert">
          {error ?? actionError}
        </p>
      ) : null}
      <div
        aria-label={intl.formatMessage(messages.rolesSectionLabel)}
        className="cl-card cl-chamfer cl-chamfer--control"
        role="region"
        style={tableStyle}
        tabIndex={0}
      >
        <div style={tableHeaderStyle}>
          <span>
            <FormattedMessage {...messages.rolesColumnUser} />
          </span>
          <span>
            <FormattedMessage {...messages.rolesColumnRole} />
          </span>
          <span>
            <FormattedMessage {...messages.rolesColumnStatus} />
          </span>
          <span>
            <FormattedMessage {...messages.rolesColumnActions} />
          </span>
        </div>
        {loading ? (
          <p style={emptyStyle}>
            <FormattedMessage {...messages.rolesLoading} />
          </p>
        ) : null}
        {!loading && rows.length === 0 ? (
          <p style={emptyStyle}>
            <FormattedMessage {...messages.rolesEmpty} />
          </p>
        ) : null}
        {rows.map((row) => (
          <RoleRow
            busy={busy === row.assignmentId}
            key={row.assignmentId}
            row={row}
            onChange={(role, status) =>
              run(row.assignmentId, () => onChange(row.assignmentId, role, status))
            }
            onDelete={() => run(row.assignmentId, () => onDelete(row.assignmentId))}
          />
        ))}
      </div>
      {inviteOpen ? (
        <InviteDialog
          busy={busy === 'invite'}
          onClose={() => setInviteOpen(false)}
          onSubmit={(email, role, status) =>
            run('invite', async () => {
              await onInvite(email, role, status);
              setInviteOpen(false);
            })
          }
        />
      ) : null}
    </section>
  );
}

function RoleRow({
  row,
  busy,
  onChange,
  onDelete,
}: {
  readonly row: OrganizationRoleResponse;
  readonly busy: boolean;
  readonly onChange: (role: OrganizationRole, status: OrganizationMemberStatus) => Promise<void>;
  readonly onDelete: () => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const initials = row.email
    .split('@')[0]
    .split(/[._-]/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div style={rowStyle}>
      <div style={userStyle}>
        <span style={avatarStyle}>{initials || 'U'}</span>
        <span>
          <strong>{row.email}</strong>
          <small style={idStyle}>ID {row.principalId.slice(-8)}</small>
        </span>
      </div>
      <select
        aria-label={intl.formatMessage(messages.rolesRoleOf, { email: row.email })}
        className="cl-focusable"
        disabled={busy}
        onChange={(event) => void onChange(event.target.value as OrganizationRole, row.status)}
        style={selectStyle}
        value={row.role}
      >
        {(Object.keys(ROLE_LABEL) as OrganizationRole[]).map((role) => (
          <option key={role} value={role}>
            {intl.formatMessage(ROLE_LABEL[role])}
          </option>
        ))}
      </select>
      <label style={statusStyle}>
        <input
          aria-label={intl.formatMessage(messages.rolesStatusOf, { email: row.email })}
          checked={row.status === 'active'}
          disabled={busy}
          onChange={(event) =>
            void onChange(row.role, event.target.checked ? 'active' : 'inactive')
          }
          type="checkbox"
        />
        <span
          style={{
            color: row.status === 'active' ? 'var(--cl-state-live)' : 'var(--cl-text-muted)',
          }}
        >
          {row.status === 'active'
            ? intl.formatMessage(messages.rolesActive)
            : intl.formatMessage(messages.rolesInactive)}
        </span>
      </label>
      <button
        aria-label={intl.formatMessage(messages.rolesDeleteOf, { email: row.email })}
        className="cl-focusable"
        disabled={busy}
        onClick={() => void onDelete()}
        style={deleteButtonStyle}
        type="button"
      >
        <FormattedMessage {...messages.rolesDelete} />
      </button>
    </div>
  );
}

function InviteDialog({
  busy,
  onClose,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (
    email: string,
    role: OrganizationRole,
    status: OrganizationMemberStatus,
  ) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>('viewer');
  const [active, setActive] = useState(true);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={intl.formatMessage(messages.rolesAddRecipient)}
      style={overlayStyle}
    >
      <form
        className="cl-card cl-chamfer"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(email, role, active ? 'active' : 'inactive');
        }}
        style={dialogStyle}
      >
        <header style={dialogHeaderStyle}>
          <h2 style={dialogTitleStyle}>
            <FormattedMessage {...messages.rolesAddRecipient} />
          </h2>
          <button
            aria-label={intl.formatMessage(messages.rolesInviteDialogClose)}
            className="cl-focusable"
            onClick={onClose}
            style={closeStyle}
            type="button"
          >
            <FormattedMessage {...messages.rolesInviteDialogClose} />
          </button>
        </header>
        <label style={fieldStyle}>
          <FormattedMessage {...messages.rolesInviteDialogEmail} />
          <input
            className="cl-focusable"
            onChange={(event) => setEmail(event.target.value)}
            required
            style={inputStyle}
            type="email"
            value={email}
          />
        </label>
        <label style={fieldStyle}>
          <FormattedMessage {...messages.rolesInviteDialogRole} />
          <select
            aria-label={intl.formatMessage(messages.rolesInviteDialogRoleAriaLabel)}
            className="cl-focusable"
            onChange={(event) => setRole(event.target.value as OrganizationRole)}
            style={inputStyle}
            value={role}
          >
            {(Object.keys(ROLE_LABEL) as OrganizationRole[]).map((one) => (
              <option key={one} value={one}>
                {intl.formatMessage(ROLE_LABEL[one])}
              </option>
            ))}
          </select>
        </label>
        <label style={statusStyle}>
          <input
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            type="checkbox"
          />
          <FormattedMessage {...messages.rolesInviteDialogActiveOnAccept} />
        </label>
        <footer style={dialogFooterStyle}>
          <button
            className="cl-focusable"
            onClick={onClose}
            style={secondaryButtonStyle}
            type="button"
          >
            <FormattedMessage {...messages.rolesInviteDialogCancel} />
          </button>
          <button className="cl-focusable" disabled={busy} style={addButtonStyle} type="submit">
            <FormattedMessage {...messages.rolesInviteDialogSubmit} />
          </button>
        </footer>
      </form>
    </div>
  );
}

const stackStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-6)' };
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'end',
  justifyContent: 'space-between',
  gap: 'var(--cl-space-4)',
  flexWrap: 'wrap',
};
const metaStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--cl-state-live)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
  textTransform: 'uppercase',
};
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-display)',
  fontSize: 'var(--cl-font-size-3xl)',
  textTransform: 'uppercase',
};
const addButtonStyle: React.CSSProperties = {
  border: 0,
  background: 'var(--cl-state-live)',
  color: 'var(--cl-surface-base)',
  fontFamily: 'var(--cl-font-display)',
  fontSize: 'var(--cl-font-size-base)',
  minHeight: 'var(--cl-touch-target)',
  padding: '0 var(--cl-space-4)',
  textTransform: 'uppercase',
};
const tableStyle: React.CSSProperties = {
  display: 'grid',
  padding: 0,
  overflowX: 'auto',
  scrollbarGutter: 'stable',
};
const tableHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(190px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr) 100px',
  minWidth: 590,
  gap: 'var(--cl-space-3)',
  padding: 'var(--cl-space-3) var(--cl-space-4)',
  borderBottom: '1px solid var(--cl-border-muted)',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
  textTransform: 'uppercase',
};
const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(190px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr) 100px',
  minWidth: 590,
  gap: 'var(--cl-space-3)',
  alignItems: 'center',
  padding: 'var(--cl-space-3) var(--cl-space-4)',
  borderBottom: '1px solid var(--cl-border-muted)',
};
const userStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-3)',
  minWidth: 0,
};
const avatarStyle: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 32,
  height: 32,
  flex: '0 0 32px',
  background: 'var(--cl-surface-raised)',
  border: '1px solid var(--cl-border-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
};
const idStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
};
const selectStyle: React.CSSProperties = {
  minHeight: 'var(--cl-touch-target)',
  background: 'var(--cl-surface-base)',
  border: '1px solid var(--cl-border-muted)',
  color: 'var(--cl-text-primary)',
  padding: '0 var(--cl-space-2)',
};
const statusStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-2)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
  textTransform: 'uppercase',
};
const deleteButtonStyle: React.CSSProperties = {
  justifySelf: 'end',
  border: '1px solid var(--cl-state-negative)',
  background: 'transparent',
  color: 'var(--cl-state-negative)',
  minHeight: 'var(--cl-touch-target)',
  padding: '0 var(--cl-space-2)',
};
const emptyStyle: React.CSSProperties = {
  margin: 0,
  padding: 'var(--cl-space-5)',
  color: 'var(--cl-text-muted)',
};
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10,
  display: 'grid',
  placeItems: 'center',
  padding: 'var(--cl-space-4)',
  background: 'color-mix(in srgb, var(--cl-surface-base) 84%, transparent)',
};
const dialogStyle: React.CSSProperties = {
  width: 'min(100%, 460px)',
  display: 'grid',
  gap: 'var(--cl-space-4)',
  padding: 'var(--cl-space-5)',
};
const dialogHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--cl-border-muted)',
  paddingBottom: 'var(--cl-space-3)',
};
const dialogTitleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-display)',
  fontSize: 'var(--cl-font-size-xl)',
  textTransform: 'uppercase',
};
const closeStyle: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: 'var(--cl-text-secondary)',
};
const fieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-2)',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
  textTransform: 'uppercase',
};
const inputStyle: React.CSSProperties = {
  minHeight: 'var(--cl-touch-target)',
  background: 'var(--cl-surface-base)',
  border: '1px solid var(--cl-border-muted)',
  color: 'var(--cl-text-primary)',
  padding: '0 var(--cl-space-3)',
};
const dialogFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'end',
  gap: 'var(--cl-space-3)',
};
const secondaryButtonStyle: React.CSSProperties = {
  minHeight: 'var(--cl-touch-target)',
  background: 'transparent',
  border: '1px solid var(--cl-border-muted)',
  color: 'var(--cl-text-primary)',
  padding: '0 var(--cl-space-3)',
};
