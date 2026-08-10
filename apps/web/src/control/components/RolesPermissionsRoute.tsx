import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type OrganizationRoleResponse,
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
