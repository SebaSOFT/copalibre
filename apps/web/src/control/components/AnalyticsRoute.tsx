import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type OrganizationStorageUsageResponse,
  type TournamentResponse,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { Card } from './ui/atoms/card.js';
import { formatStorageBytes } from './PreferencesRoute.js';
import { messages } from '../i18n/messages.en.js';

export function AnalyticsRoute({
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

  const [tournaments, setTournaments] = useState<readonly TournamentResponse[]>([]);
  const [storage, setStorage] = useState<OrganizationStorageUsageResponse | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const listTournaments = api.listActiveTournaments;
    const getStorage = api.getStorageUsage;

    Promise.all([
      listTournaments ? listTournaments(organizationAlias) : Promise.resolve([]),
      getStorage
        ? getStorage(organizationAlias).catch(() => undefined)
        : Promise.resolve(undefined),
    ])
      .then(([loadedTournaments, loadedStorage]) => {
        if (!active) return;
        setTournaments(loadedTournaments);
        setStorage(loadedStorage);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, organizationAlias]);

  const liveCount = tournaments.filter((t) => t.status === 'started').length;
  const finishedCount = tournaments.filter((t) => t.status === 'finished').length;
  const upcomingCount = tournaments.filter((t) => t.status === 'published').length;

  return (
    <div className="cl-analytics" style={{ display: 'grid', gap: 'var(--cl-space-6)' }}>
      <header>
        <h1 style={{ margin: '0 0 var(--cl-space-2)', fontSize: 'var(--cl-font-size-2xl)' }}>
          {intl.formatMessage(messages.navAnalytics)}
        </h1>
        <p style={{ margin: 0, color: 'var(--cl-text-muted)' }}>
          Métricas de rendimiento y volumen operativo de la organización.
        </p>
      </header>

      {loading ? (
        <p>Cargando analíticas…</p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--cl-space-6)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--cl-space-4)',
            }}
          >
            <Card>
              <div style={{ padding: 'var(--cl-space-4)' }}>
                <span style={{ fontSize: 'var(--cl-font-size-sm)', color: 'var(--cl-text-muted)' }}>
                  Total de torneos
                </span>
                <div
                  style={{
                    fontSize: 'var(--cl-font-size-3xl, 2rem)',
                    fontWeight: 700,
                    margin: 'var(--cl-space-2) 0',
                  }}
                >
                  {tournaments.length}
                </div>
                <span style={{ fontSize: 'var(--cl-font-size-xs)', color: 'var(--cl-text-muted)' }}>
                  {liveCount} en vivo · {upcomingCount} próximos · {finishedCount} finalizados
                </span>
              </div>
            </Card>

            <Card>
              <div style={{ padding: 'var(--cl-space-4)' }}>
                <span style={{ fontSize: 'var(--cl-font-size-sm)', color: 'var(--cl-text-muted)' }}>
                  Torneos finalizados
                </span>
                <div
                  style={{
                    fontSize: 'var(--cl-font-size-3xl, 2rem)',
                    fontWeight: 700,
                    margin: 'var(--cl-space-2) 0',
                  }}
                >
                  {finishedCount}
                </div>
                <span style={{ fontSize: 'var(--cl-font-size-xs)', color: 'var(--cl-text-muted)' }}>
                  Resultados archivados y completados
                </span>
              </div>
            </Card>

            <Card>
              <div style={{ padding: 'var(--cl-space-4)' }}>
                <span style={{ fontSize: 'var(--cl-font-size-sm)', color: 'var(--cl-text-muted)' }}>
                  Almacenamiento utilizado
                </span>
                <div
                  style={{
                    fontSize: 'var(--cl-font-size-3xl, 2rem)',
                    fontWeight: 700,
                    margin: 'var(--cl-space-2) 0',
                  }}
                >
                  {storage ? formatStorageBytes(storage.totalBytes) : '—'}
                </div>
                <span style={{ fontSize: 'var(--cl-font-size-xs)', color: 'var(--cl-text-muted)' }}>
                  {storage ? `${storage.objectCount} archivos multimedia` : 'Sin datos'}
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
