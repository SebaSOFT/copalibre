import { EmptyState } from '../ui/molecules/empty-state.js';
import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { isSupportedLanguage } from '@copalibre/domain';
import type { SupportedLanguage } from '../../../lib/language-preference.js';
import type {
  ClubResponse,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationRoleResponse,
  PendingOrganizationInvitationResponse,
  TournamentResponse,
} from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { Button } from '../ui/atoms/button.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Input } from '../ui/atoms/input.js';
import { Label } from '../ui/atoms/label.js';
import { Select } from '../ui/atoms/select.js';
import { DecisionHint } from '../ui/atoms/decision-hint.js';
import { Form } from '../ui/atoms/form.js';
import { Field } from '../ui/molecules/field.js';
import { helpPageUrl } from '../../lib/control-navigation.js';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/atoms/card.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';
import { FilterBar } from '../ui/organisms/filter-bar.js';
import { KpiStrip } from '../ui/organisms/kpi-strip.js';
import { ListWithRailTemplate } from './ListWithRailTemplate.js';
import { EntityIdentityCell } from '../ui/molecules/entity-identity-cell.js';
import { useToast } from '../ToastProvider.js';

const ROLE_LABEL: Record<OrganizationRole, MessageDescriptor> = {
  admin: messages.rolesRoleAdmin,
  'club-admin': messages.rolesRoleClubAdmin,
  'tournament-admin': messages.rolesRoleTournamentAdmin,
  referee: messages.rolesRoleReferee,
  broadcaster: messages.rolesRoleBroadcaster,
  viewer: messages.rolesRoleViewer,
};

/** Condensed from each role's own "What this role is for" help page. */
const ROLE_DESCRIPTION: Record<OrganizationRole, MessageDescriptor> = {
  admin: messages.rolesDescriptionAdmin,
  'club-admin': messages.rolesDescriptionClubAdmin,
  'tournament-admin': messages.rolesDescriptionTournamentAdmin,
  referee: messages.rolesDescriptionReferee,
  broadcaster: messages.rolesDescriptionBroadcaster,
  viewer: messages.rolesDescriptionViewer,
};

/** The "learn more" link beside a role `DecisionHint` — a plain `<a>`, not a `DecisionHint` prop: a real navigation to a separate Starlight route, the same reason `ControlShell.tsx`'s own help link opens this way. */
function RoleLearnMoreLink({
  role,
  language,
}: {
  readonly role: OrganizationRole;
  readonly language: SupportedLanguage;
}): React.JSX.Element {
  return (
    <a
      className="cl-focusable"
      href={helpPageUrl(language, `roles/${role}`)}
      rel="noopener noreferrer"
      target="_blank"
    >
      <FormattedMessage {...messages.rolesLearnMore} />
    </a>
  );
}

/** Every role this taxonomy declares, matching a super-admin's full grantable set. */
const ALL_ROLES: readonly OrganizationRole[] = [
  'admin',
  'club-admin',
  'tournament-admin',
  'referee',
  'broadcaster',
  'viewer',
];

export function RolesPermissionsTemplate({
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
  /** Invitations not yet accepted, not rescinded, not expired. */
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
  const [busy, setBusy] = useState<string>();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | OrganizationRole>('all');

  // A load/action failure is an operation result, not an in-progress field
  // validation problem — it belongs to the toast mechanism, never a
  // screen-local alert. The `error` prop (a load
  // failure surfaced by the owning route) is reported the same way.
  useEffect(() => {
    if (error) toast.push({ severity: 'error', message: error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const run = async (key: string, action: () => Promise<void>): Promise<boolean> => {
    setBusy(key);
    try {
      await action();
      return true;
    } catch (cause) {
      toast.push({
        severity: 'error',
        message:
          cause instanceof Error ? cause.message : intl.formatMessage(messages.rolesChangeFailed),
      });
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const columns: readonly DataTableColumn<OrganizationRoleResponse>[] = [
    {
      key: 'user',
      header: <FormattedMessage {...messages.rolesColumnUser} />,
      render: (row) => <EntityIdentityCell email={row.email} />,
    },
    {
      key: 'role',
      header: <FormattedMessage {...messages.rolesColumnRole} />,
      render: (row) => (
        <RoleSelect
          assignableRoles={assignableRoles}
          scopeLine={scopeLine(row)}
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

  const normalizedSearch = search.trim().toLowerCase();
  const visibleRows = rows.filter(
    (row) =>
      (roleFilter === 'all' || row.role === roleFilter) &&
      (normalizedSearch === '' || row.email.toLowerCase().includes(normalizedSearch)),
  );
  const roleOptions = [
    { id: 'all', label: intl.formatMessage(messages.rolesFilterAll), count: rows.length },
    ...ALL_ROLES.flatMap((role) => {
      const count = rows.filter((row) => row.role === role).length;
      return count === 0 ? [] : [{ id: role, label: intl.formatMessage(ROLE_LABEL[role]), count }];
    }),
  ];

  return (
    <ListWithRailTemplate
      description={<FormattedMessage {...messages.rolesDescription} />}
      listLabel={intl.formatMessage(messages.rolesTitle)}
      listing={
        loading ? (
          <p className="cl-list-screen__empty">
            <FormattedMessage {...messages.rolesLoading} />
          </p>
        ) : (
          <div className="cl-operations__listing">
            <KpiStrip
              ariaLabel={intl.formatMessage(messages.rolesKpiLabel)}
              metrics={[
                {
                  key: 'operators',
                  label: intl.formatMessage(messages.rolesKpiOperators),
                  sourceField: 'operators',
                  formatValue: (value) => String(value),
                },
                {
                  key: 'pending-invitations',
                  label: intl.formatMessage(messages.rolesPendingInvitationsTitle),
                  sourceField: 'pendingInvitations',
                  formatValue: (value) => String(value),
                },
              ]}
              source={{
                operators: rows.length,
                ...(pendingInvitations === undefined
                  ? {}
                  : { pendingInvitations: pendingInvitations.length }),
              }}
            />
            <FilterBar
              filtersLabel={intl.formatMessage(messages.rolesFiltersLabel)}
              onOptionChange={(id) => {
                setRoleFilter(id === 'all' ? 'all' : (id as OrganizationRole));
              }}
              onSearchChange={setSearch}
              options={roleOptions}
              resultCount={intl.formatMessage(messages.rolesResultCount, {
                count: visibleRows.length,
              })}
              searchId="roles-operator-search"
              searchLabel={intl.formatMessage(messages.rolesSearchLabel)}
              searchPlaceholder={intl.formatMessage(messages.rolesSearchPlaceholder)}
              searchValue={search}
              selectedOptionId={roleFilter}
            />
            <DataTable
              columns={columns}
              emptyMessage={intl.formatMessage(
                rows.length === 0 ? messages.rolesEmpty : messages.rolesNoMatches,
              )}
              rowKey={(row) => row.assignmentId}
              rows={visibleRows}
            />
            {pendingInvitations !== undefined && (
              <section
                aria-label={intl.formatMessage(messages.rolesPendingInvitationsTitle)}
                className="cl-operations__section"
              >
                <h2>
                  <FormattedMessage {...messages.rolesPendingInvitationsTitle} />
                </h2>
                {pendingInvitations.length === 0 ? (
                  <EmptyState
                    icon="team"
                    headingLevel={3}
                    heading={intl.formatMessage(messages.rolesPendingInvitationsEmpty)}
                    description={intl.formatMessage(messages.interactionInviteDescription)}
                    {...(assignableRoles.length === 0
                      ? {
                          reason: 'no-permission' as const,
                          whoCanAct: intl.formatMessage(messages.interactionWhoCanInvite),
                        }
                      : { reason: 'informational' as const })}
                  />
                ) : (
                  <ul className="cl-operations__invitations">
                    {pendingInvitations.map((invitation) => (
                      <li key={invitation.invitationId}>
                        <EntityIdentityCell
                          email={invitation.recipientEmail}
                          meta={intl.formatMessage(ROLE_LABEL[invitation.role])}
                        />
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
          </div>
        )
      }
      rail={
        assignableRoles.length > 0 ? (
          <InviteForm
            assignableRoles={assignableRoles}
            busy={busy === 'invite'}
            clubs={clubs ?? []}
            onSubmit={(email, role, status, scope) =>
              run('invite', () => onInvite(email, role, status, scope))
            }
            tournaments={tournaments ?? []}
          />
        ) : (
          <EmptyState
            icon="team"
            headingLevel={2}
            heading={intl.formatMessage(messages.rolesAddUser)}
            description={intl.formatMessage(messages.interactionInviteDescription)}
            reason="no-permission"
            whoCanAct={intl.formatMessage(messages.interactionWhoCanInvite)}
          />
        )
      }
      railLabel={intl.formatMessage(messages.rolesAddUser)}
      title={<FormattedMessage {...messages.rolesTitle} />}
    />
  );

  function scopeLine(row: OrganizationRoleResponse): string {
    if (row.role === 'club-admin' && row.clubId !== undefined) {
      const club = (clubs ?? []).find((one) => one.clubId === row.clubId);
      if (club) return intl.formatMessage(messages.rolesScopeClub, { name: club.name });
    }
    if (row.role === 'tournament-admin' && row.tournamentId !== undefined) {
      const tournament = (tournaments ?? []).find((one) => one.tournamentId === row.tournamentId);
      if (tournament) {
        return intl.formatMessage(messages.rolesScopeTournament, { name: tournament.name });
      }
    }
    return intl.formatMessage(messages.rolesScopeOrganization);
  }

  function isLastActiveAdmin(row: OrganizationRoleResponse, count: number): boolean {
    return row.role === 'admin' && row.status === 'active' && count <= 1;
  }
}

function RoleSelect({
  row,
  assignableRoles,
  scopeLine,
  disabled,
  isLastActiveAdmin,
  onChange,
}: {
  readonly row: OrganizationRoleResponse;
  readonly assignableRoles: readonly OrganizationRole[];
  /** Where the role applies: the whole organization, one club or one tournament. */
  readonly scopeLine: string;
  readonly disabled: boolean;
  readonly isLastActiveAdmin: boolean;
  readonly onChange: (role: OrganizationRole) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
  const roles = assignableRoles.includes(row.role)
    ? assignableRoles
    : [row.role, ...assignableRoles];
  const hintId = `role-hint-${row.assignmentId}`;
  return (
    <div className="cl-role-cell">
      <div className="cl-role-cell__select">
        <Select
          aria-describedby={hintId}
          aria-label={intl.formatMessage(messages.rolesRoleOf, { email: row.email })}
          disabled={disabled}
          onValueChange={(val) => onChange(val as OrganizationRole)}
          options={roles.map((role) => ({
            value: role,
            label: intl.formatMessage(ROLE_LABEL[role]),
          }))}
          title={
            isLastActiveAdmin ? intl.formatMessage(messages.rolesLastActiveAdminNotice) : undefined
          }
          value={row.role}
        />
      </div>
      <p className="cl-role-cell__scope">{scopeLine}</p>
      <div className="cl-role-cell__details">
        <DecisionHint id={hintId} text={intl.formatMessage(ROLE_DESCRIPTION[row.role])} />
        <RoleLearnMoreLink language={language} role={row.role} />
      </div>
    </div>
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
    <Label className="cl-role-status">
      <Checkbox
        aria-label={intl.formatMessage(messages.rolesStatusOf, { email: row.email })}
        checked={row.status === 'active'}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(checked ? 'active' : 'inactive')}
        title={
          isLastActiveAdmin ? intl.formatMessage(messages.rolesLastActiveAdminNotice) : undefined
        }
      />
      <span
        className={row.status === 'active' ? 'cl-role-status--active' : 'cl-role-status--inactive'}
      >
        {row.status === 'active'
          ? intl.formatMessage(messages.rolesActive)
          : intl.formatMessage(messages.rolesInactive)}
      </span>
    </Label>
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

/** The rail form that invites one person; the list beside it updates when it succeeds. */
export function InviteForm({
  busy,
  assignableRoles,
  clubs,
  tournaments,
  onSubmit,
}: {
  readonly busy: boolean;
  readonly assignableRoles: readonly OrganizationRole[];
  /** Clubs in this organization; the club-admin picker lists only these. */
  readonly clubs: readonly ClubResponse[];
  /** Tournaments in this organization; the tournament-admin picker lists only these. */
  readonly tournaments: readonly TournamentResponse[];
  readonly onSubmit: (
    email: string,
    role: OrganizationRole,
    status: OrganizationMemberStatus,
    scope?: { readonly clubId?: string; readonly tournamentId?: string },
  ) => Promise<boolean>;
}): React.JSX.Element {
  const intl = useIntl();
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>(
    assignableRoles.includes('viewer') ? 'viewer' : (assignableRoles[0] ?? 'viewer'),
  );
  const [active, setActive] = useState(true);
  const [clubId, setClubId] = useState<string>('');
  const [tournamentId, setTournamentId] = useState<string>('');
  return (
    <Card className="cl-operations__rail-card">
      <CardHeader>
        <CardTitle>
          <FormattedMessage {...messages.rolesAddUser} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form
          id="invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(email, role, active ? 'active' : 'inactive', {
              ...(role === 'club-admin' ? { clubId } : {}),
              ...(role === 'tournament-admin' ? { tournamentId } : {}),
            }).then((invited) => {
              if (invited) setEmail('');
            });
          }}
        >
          <Field id="invite-email" label={intl.formatMessage(messages.rolesInviteDialogEmail)}>
            <Input
              id="invite-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </Field>
          <Field id="invite-role" label={intl.formatMessage(messages.rolesInviteDialogRole)}>
            <Select
              aria-describedby="invite-role-hint"
              aria-label={intl.formatMessage(messages.rolesInviteDialogRoleAriaLabel)}
              id="invite-role"
              onValueChange={(val) => setRole(val as OrganizationRole)}
              options={assignableRoles.map((one) => ({
                value: one,
                label: intl.formatMessage(ROLE_LABEL[one]),
              }))}
              value={role}
            />
          </Field>
          <DecisionHint id="invite-role-hint" text={intl.formatMessage(ROLE_DESCRIPTION[role])} />
          <RoleLearnMoreLink language={language} role={role} />
          {role === 'club-admin' && (
            <Field id="invite-club" label={intl.formatMessage(messages.rolesInviteDialogClub)}>
              <Select
                aria-label={intl.formatMessage(messages.rolesInviteDialogClubAriaLabel)}
                id="invite-club"
                onValueChange={(val) => setClubId(val)}
                options={[
                  { value: '', label: intl.formatMessage(messages.rolesSelectClubPlaceholder) },
                  ...clubs.map((club) => ({
                    value: club.clubId,
                    label: club.name,
                  })),
                ]}
                required
                value={clubId}
              />
            </Field>
          )}
          {role === 'tournament-admin' && (
            <Field
              id="invite-tournament"
              label={intl.formatMessage(messages.rolesInviteDialogTournament)}
            >
              <Select
                aria-label={intl.formatMessage(messages.rolesInviteDialogTournamentAriaLabel)}
                id="invite-tournament"
                onValueChange={(val) => setTournamentId(val)}
                options={[
                  {
                    value: '',
                    label: intl.formatMessage(messages.rolesSelectTournamentPlaceholder),
                  },
                  ...tournaments.map((tournament) => ({
                    value: tournament.tournamentId,
                    label: tournament.name,
                  })),
                ]}
                required
                value={tournamentId}
              />
            </Field>
          )}
          <Label className="cl-toggle cl-focusable">
            <Checkbox checked={active} onCheckedChange={(checked) => setActive(checked)} />
            <span>
              <FormattedMessage {...messages.rolesInviteDialogActiveOnAccept} />
            </span>
          </Label>
          <Button
            disabled={
              busy ||
              (role === 'club-admin' && clubId === '') ||
              (role === 'tournament-admin' && tournamentId === '')
            }
            type="submit"
          >
            <FormattedMessage {...messages.rolesInviteDialogSubmit} />
          </Button>
        </Form>
      </CardContent>
    </Card>
  );
}
