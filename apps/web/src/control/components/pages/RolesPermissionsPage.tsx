import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type OrganizationRole,
  type OrganizationRoleResponse,
  type PendingOrganizationInvitationResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { RolesPermissionsTemplate } from '../screens/RolesPermissionsTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

export function RolesPermissionsPage({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const read = useResilientRead(
    `control-roles:${organizationAlias}`,
    async () => {
      const [rows, pendingInvitations, clubs, tournaments, grantable] = await Promise.all([
        api.listOrganizationRoles(organizationAlias),
        api.listPendingInvitations?.(organizationAlias),
        api.listClubs?.(organizationAlias) ?? Promise.resolve([]),
        api.listActiveTournaments?.(organizationAlias) ?? Promise.resolve([]),
        api.listGrantableRoles?.(organizationAlias),
      ]);
      return {
        rows,
        pendingInvitations,
        clubs,
        tournaments,
        grantableRoles: grantable?.roles.filter(
          (role): role is OrganizationRole => role !== 'super-admin',
        ),
      };
    },
    { thing: intl.formatMessage(messages.rolesTitle), isEmpty: (data) => data.rows.length === 0 },
  );
  const {
    rows = [],
    pendingInvitations,
    clubs = [],
    tournaments = [],
    grantableRoles,
  } = read.data ?? {};
  const setRows = (
    change: (rows: readonly OrganizationRoleResponse[]) => readonly OrganizationRoleResponse[],
  ): void => read.update((current) => ({ ...current, rows: change(current.rows) }));
  const setPendingInvitations = (
    change: (
      rows: readonly PendingOrganizationInvitationResponse[] | undefined,
    ) => readonly PendingOrganizationInvitationResponse[] | undefined,
  ): void =>
    read.update((current) => ({
      ...current,
      pendingInvitations: change(current.pendingInvitations),
    }));
  const load = read.retry;
  const loadPendingInvitations = read.retry;

  return (
    <ReadState {...read} title={intl.formatMessage(messages.rolesTitle)}>
      <RolesPermissionsTemplate
        clubs={clubs}
        error={undefined}
        grantableRoles={grantableRoles}
        loading={false}
        organizationAlias={organizationAlias}
        pendingInvitations={pendingInvitations}
        rows={rows}
        tournaments={tournaments}
        onRescindInvitation={
          api.rescindInvitation &&
          (async (invitationId) => {
            await api.rescindInvitation?.(organizationAlias, invitationId);
            setPendingInvitations((current) =>
              current?.filter((invitation) => invitation.invitationId !== invitationId),
            );
          })
        }
        onChange={async (assignmentId, role, status) => {
          const updated = await api.changeOrganizationRole(organizationAlias, assignmentId, {
            role,
            status,
          });
          setRows((current) =>
            current.map((row) => (row.assignmentId === assignmentId ? updated : row)),
          );
        }}
        onDelete={async (assignmentId) => {
          await api.deleteOrganizationRole(organizationAlias, assignmentId);
          setRows((current) => current.filter((row) => row.assignmentId !== assignmentId));
        }}
        onInvite={async (email, role, status, scope) => {
          await api.inviteOrganizationUser(organizationAlias, { email, role, status, ...scope });
          await load();
          await loadPendingInvitations();
        }}
      />
    </ReadState>
  );
}
