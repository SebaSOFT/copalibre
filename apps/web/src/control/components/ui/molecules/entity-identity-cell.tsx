/**
 * Original composition — an identity chip (avatar initials + primary
 * label + a truncated secondary id) for one row of any listing keyed by
 * email/principal (roles, invitations, an installation's super-admins).
 * Extracted from an inline `RoleUserCell` definition in
 * `RolesPermissionsPage.tsx`: single-use in that screen does not make it a
 * "page" concern — it is a table-row-cell molecule regardless of consumer
 * count (design.md Decision 7). Deliberately typed on generic email/id
 * strings rather than `OrganizationRoleResponse`, unlike this same screen's
 * role-select/status-toggle cells, which stay page-local because they are
 * genuinely coupled to the organization-role domain shape (the same
 * shaping-layer distinction `table-projections.ts` draws for `DataTable`,
 * design.md Decision 3).
 */
export interface EntityIdentityCellProps {
  readonly email: string;
  readonly id: string;
}

export function EntityIdentityCell({ email, id }: EntityIdentityCellProps): React.JSX.Element {
  const initials = email
    .split('@')[0]
    .split(/[._-]/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="cl-role-user">
      <span className="cl-role-user__avatar">{initials || 'U'}</span>
      <span>
        <strong>{email}</strong>
        <small className="cl-role-user__id">ID {id.slice(-8)}</small>
      </span>
    </div>
  );
}
