import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ClubResponse,
  type ControlApiClient,
  type OrganizationRole,
  type OrganizationRoleResponse,
  type PendingOrganizationInvitationResponse,
  type TournamentResponse,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { RolesPermissionsPage } from './RolesPermissionsPage.js';
import { messages } from '../i18n/messages.en.js';

export function RolesPermissionsRoute({
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
  const [rows, setRows] = useState<readonly OrganizationRoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [grantableRoles, setGrantableRoles] = useState<readonly OrganizationRole[]>();
  const [clubs, setClubs] = useState<readonly ClubResponse[]>([]);
  const [tournaments, setTournaments] = useState<readonly TournamentResponse[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<
    readonly PendingOrganizationInvitationResponse[] | undefined
  >(undefined);

  const loadPendingInvitations = useCallback(async (): Promise<void> => {
    if (!api.listPendingInvitations) return;
    try {
      const loaded = await api.listPendingInvitations(organizationAlias);
      setPendingInvitations(Array.isArray(loaded) ? loaded : []);
    } catch {
      // Left undefined: the section hides itself rather than showing a stale list.
    }
  }, [api, organizationAlias]);

  useEffect(() => {
    let current = true;
    if (!api.listPendingInvitations) return;
    void api
      .listPendingInvitations(organizationAlias)
      .then((loaded) => {
        if (current) setPendingInvitations(Array.isArray(loaded) ? loaded : []);
      })
      .catch(() => {
        // Left undefined: the section hides itself rather than showing a stale list.
      });
    return () => {
      current = false;
    };
  }, [api, organizationAlias]);

  useEffect(() => {
    let current = true;
    if (!api.listClubs) return;
    void api
      .listClubs(organizationAlias)
      .then((response) => {
        if (current) setClubs(response);
      })
      .catch(() => {
        // The club picker is empty until this loads; the invite dialog
        // itself still requires a selection before a club-admin can submit.
      });
    return () => {
      current = false;
    };
  }, [api, organizationAlias]);

  useEffect(() => {
    let current = true;
    if (!api.listActiveTournaments) return;
    void api
      .listActiveTournaments(organizationAlias)
      .then((response) => {
        if (current) setTournaments(response);
      })
      .catch(() => {
        // Same fallback as the club picker above.
      });
    return () => {
      current = false;
    };
  }, [api, organizationAlias]);

  useEffect(() => {
    let current = true;
    if (!api.listGrantableRoles) return;
    void api
      .listGrantableRoles(organizationAlias)
      .then((response) => {
        if (current) {
          setGrantableRoles(
            response.roles.filter((role): role is OrganizationRole => role !== 'super-admin'),
          );
        }
      })
      .catch(() => {
        // Grantable-role filtering is a UI convenience; a fetch failure here
        // falls back to RolesPermissionsPage's own "show everything" default.
      });
    return () => {
      current = false;
    };
  }, [api, organizationAlias]);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setRows(await api.listOrganizationRoles(organizationAlias));
      setError(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : intl.formatMessage(messages.rolesLoadFailed),
      );
    } finally {
      setLoading(false);
    }
  }, [api, organizationAlias, intl]);

  useEffect(() => {
    let current = true;
    void api
      .listOrganizationRoles(organizationAlias)
      .then((loaded) => {
        if (current) {
          setRows(loaded);
          setError(undefined);
        }
      })
      .catch((cause: unknown) => {
        if (current) {
          setError(
            cause instanceof Error ? cause.message : intl.formatMessage(messages.rolesLoadFailed),
          );
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [api, organizationAlias, intl]);

  return (
    <RolesPermissionsPage
      clubs={clubs}
      error={error}
      grantableRoles={grantableRoles}
      loading={loading}
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
  );
}
