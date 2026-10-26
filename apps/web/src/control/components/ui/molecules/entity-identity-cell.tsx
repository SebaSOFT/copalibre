/**
 * Original composition — an identity chip (avatar initials + primary
 * label) for one row of any listing keyed by
 * email/principal (roles, invitations, an installation's super-admins).
 * Extracted from an inline `RoleUserCell` definition in
 * `RolesPermissionsTemplate.tsx`: single-use in that screen does not make it a
 * "page" concern — it is a table-row-cell molecule regardless of consumer
 * count. Deliberately typed on generic email/id
 * strings rather than `OrganizationRoleResponse`, unlike this same screen's
 * role-select/status-toggle cells, which stay page-local because they are
 * genuinely coupled to the organization-role domain shape (the same
 * shaping-layer distinction `table-projections.ts` draws for `DataTable`).
 */
export interface EntityIdentityCellProps {
  readonly email: string;
}

export function EntityIdentityCell({ email }: EntityIdentityCellProps): React.JSX.Element {
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
      <strong>{email}</strong>
    </div>
  );
}
