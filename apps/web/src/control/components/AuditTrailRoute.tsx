import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type AuditRecordResponse,
  type ControlApiClient,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { AuditTrailPage } from './AuditTrailPage.js';
import { messages } from '../i18n/messages.en.js';

const PAGE_SIZE = 25;

export function AuditTrailRoute({
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
  const [records, setRecords] = useState<readonly AuditRecordResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [actorFilter, setActorFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!api.fetchAuditTrail) return;
    let current = true;
    void api
      .fetchAuditTrail(organizationAlias, {
        limit: PAGE_SIZE,
        offset,
        ...(actorFilter === '' ? {} : { actor: actorFilter }),
      })
      .then((page) => {
        if (!current) return;
        setRecords(page.records);
        setTotal(page.total);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : intl.formatMessage(messages.auditTrailLoadFailed),
        );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [api, organizationAlias, offset, actorFilter, intl]);

  return (
    <AuditTrailPage
      organizationAlias={organizationAlias}
      records={records}
      loading={loading}
      error={error}
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
  );
}
