import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { AuditTrailTemplate, type AuditActorProfile } from '../screens/AuditTrailTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

const PAGE_SIZE = 25;

export function AuditTrailPage({
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
  const [offset, setOffset] = useState(0);
  const [actorFilter, setActorFilter] = useState('');
  const rolesRead = useResilientRead(
    `control-audit-actors:${organizationAlias}`,
    async () => {
      const roles = await api.listOrganizationRoles(organizationAlias);
      const actors: Record<string, AuditActorProfile> = {};
      for (const r of roles) {
        const profile = { email: r.email, role: r.role, principalId: r.principalId };
        for (const key of [r.principalId, `user:${r.principalId}`, r.email, `user:${r.email}`])
          actors[key] = profile;
      }
      return actors;
    },
    { thing: intl.formatMessage(messages.auditTrailTitle) },
  );
  const read = useResilientRead(
    `control-audit:${organizationAlias}:${offset}:${actorFilter}`,
    () =>
      api.fetchAuditTrail?.(organizationAlias, {
        limit: PAGE_SIZE,
        offset,
        ...(actorFilter === '' ? {} : { actor: actorFilter }),
      }) ?? Promise.resolve({ records: [], total: 0, limit: PAGE_SIZE, offset }),
    {
      thing: intl.formatMessage(messages.auditTrailTitle),
      isEmpty: (data) => data.records.length === 0,
    },
  );
  if (read.data === undefined)
    return (
      <ReadState
        {...read}
        title={intl.formatMessage(messages.auditTrailTitle)}
        variant="table-row"
      />
    );
  const { records, total } = read.data;
  const actors = rolesRead.data ?? {};

  return (
    <ReadState {...read} title={intl.formatMessage(messages.auditTrailTitle)}>
      <AuditTrailTemplate
        organizationAlias={organizationAlias}
        records={records}
        actors={actors}
        loading={false}
        error={undefined}
        total={total}
        limit={PAGE_SIZE}
        offset={offset}
        actorFilter={actorFilter}
        onActorFilterChange={(value) => {
          // A filtered trail keeps its own paging, independent of where the
          // unfiltered one left off.
          setActorFilter(value);
          setOffset(0);
        }}
        onPreviousPage={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
        onNextPage={() => setOffset((current) => current + PAGE_SIZE)}
      />
    </ReadState>
  );
}
