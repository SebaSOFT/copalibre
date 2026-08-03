import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createControlApiClient,
  type ControlApiClient,
  type OrganizationRoleResponse,
} from '../lib/api-client.js';
import { RolesPermissionsPage } from './RolesPermissionsPage.js';

export function RolesPermissionsRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const api = useMemo(
    () => client ?? createControlApiClient({ fetch: globalThis.fetch.bind(globalThis) }),
    [client],
  );
  const [rows, setRows] = useState<readonly OrganizationRoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setRows(await api.listOrganizationRoles(organizationAlias));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, [api, organizationAlias]);

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
          setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los usuarios.');
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [api, organizationAlias]);

  return (
    <RolesPermissionsPage
      error={error}
      loading={loading}
      organizationAlias={organizationAlias}
      rows={rows}
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
      onInvite={async (email, role, status) => {
        await api.inviteOrganizationUser(organizationAlias, { email, role, status });
        await load();
      }}
    />
  );
}
