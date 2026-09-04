import type { PlayerRole } from '@copalibre/domain';
import { FormField } from './ui/molecules/form-field.js';

export interface RosterMemberItem {
  readonly personId: string;
  readonly displayName: string;
  readonly role: PlayerRole;
  readonly nationality?: string;
  readonly photoObjectId?: string;
}

export const ROSTER_ROLE_LABELS: Readonly<Record<PlayerRole, string>> = {
  player: 'Jugador',
  substitute: 'Suplente',
  coach: 'Coach',
  staff: 'Staff',
};

export const ROSTER_ROLE_ACCENTS: Readonly<Record<PlayerRole, string>> = {
  coach: 'cl-state--live',
  staff: 'cl-state--upcoming',
  substitute: 'cl-state--muted',
  player: 'cl-state--positive',
};

export const ROSTER_ROLES: readonly PlayerRole[] = ['player', 'substitute', 'coach', 'staff'];

export interface RosterRoleSelectorProps {
  readonly members: readonly RosterMemberItem[];
  readonly onChange: (members: readonly RosterMemberItem[]) => void;
  readonly disabled?: boolean;
}

/**
 * Roster member role editor allowing operators to select and mutate roles
 * (player, substitute, coach, staff) for team members.
 */
export function RosterRoleSelector({
  members,
  onChange,
  disabled = false,
}: RosterRoleSelectorProps): React.JSX.Element {
  const handleRoleChange = (personId: string, newRole: PlayerRole) => {
    const updated = members.map((m) => (m.personId === personId ? { ...m, role: newRole } : m));
    onChange(updated);
  };

  if (members.length === 0) {
    return <p className="cl-decision-hint">No hay miembros en este equipo todavía.</p>;
  }

  return (
    <div className="cl-roster-role-selector" style={{ display: 'grid', gap: 'var(--cl-space-3)' }}>
      {members.map((member) => (
        <div
          key={member.personId}
          className="cl-card cl-chamfer cl-chamfer--control cl-roster-member-row"
          data-testid={`roster-member-${member.personId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--cl-space-3)',
            padding: 'var(--cl-space-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-2)' }}>
            <strong>{member.displayName || member.personId}</strong>
            <span
              className={`cl-badge ${ROSTER_ROLE_ACCENTS[member.role] ?? 'cl-state--muted'}`}
              data-testid={`role-badge-${member.personId}`}
            >
              {ROSTER_ROLE_LABELS[member.role] ?? member.role}
            </span>
          </div>

          <div style={{ minWidth: '160px' }}>
            <FormField
              id={`role-select-${member.personId}`}
              label={`Rol de ${member.displayName || member.personId}`}
            >
              <select
                aria-label={`Rol de ${member.displayName || member.personId}`}
                className="cl-select cl-select--default cl-focusable"
                data-testid={`role-select-${member.personId}`}
                disabled={disabled}
                id={`role-select-${member.personId}`}
                onChange={(e) => handleRoleChange(member.personId, e.target.value as PlayerRole)}
                value={member.role}
              >
                {ROSTER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROSTER_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </div>
      ))}
    </div>
  );
}
