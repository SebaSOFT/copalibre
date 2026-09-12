import type { IntlShape } from 'react-intl';
import { useIntl } from 'react-intl';
import type { PlayerRole } from '@copalibre/domain';
import { Select } from './ui/atoms/select.js';
import { Field } from './ui/molecules/field.js';
import { messages } from '../i18n/messages.en.js';

export interface RosterMemberItem {
  readonly personId: string;
  readonly displayName: string;
  readonly role: PlayerRole;
  readonly nationality?: string;
  readonly photoObjectId?: string;
}

/**
 * A function rather than the static lookup object it replaces
 * (`ROSTER_ROLE_LABELS`, hardcoded Spanish): the label depends on the
 * active locale, which only the caller's own `useIntl()` knows.
 */
export function rosterRoleLabel(role: PlayerRole, intl: IntlShape): string {
  switch (role) {
    case 'player':
      return intl.formatMessage(messages.rosterRolePlayer);
    case 'substitute':
      return intl.formatMessage(messages.rosterRoleSubstitute);
    case 'coach':
      return intl.formatMessage(messages.rosterRoleCoach);
    case 'staff':
      return intl.formatMessage(messages.rosterRoleStaff);
  }
}

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
  const intl = useIntl();
  const handleRoleChange = (personId: string, newRole: PlayerRole) => {
    const updated = members.map((m) => (m.personId === personId ? { ...m, role: newRole } : m));
    onChange(updated);
  };

  if (members.length === 0) {
    return <p className="cl-decision-hint">{intl.formatMessage(messages.rosterNoMembersYet)}</p>;
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
              {rosterRoleLabel(member.role, intl)}
            </span>
          </div>

          <div style={{ minWidth: 'min(100%, 160px)' }}>
            <Field
              id={`role-select-${member.personId}`}
              label={intl.formatMessage(messages.rosterRoleFieldLabel, {
                name: member.displayName || member.personId,
              })}
            >
              <Select
                aria-label={intl.formatMessage(messages.rosterRoleFieldLabel, {
                  name: member.displayName || member.personId,
                })}
                data-testid={`role-select-${member.personId}`}
                disabled={disabled}
                id={`role-select-${member.personId}`}
                onValueChange={(val) => handleRoleChange(member.personId, val as PlayerRole)}
                options={ROSTER_ROLES.map((role) => ({
                  value: role,
                  label: rosterRoleLabel(role, intl),
                }))}
                value={member.role}
              />
            </Field>
          </div>
        </div>
      ))}
    </div>
  );
}
