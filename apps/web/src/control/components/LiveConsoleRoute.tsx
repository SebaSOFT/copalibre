import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type TournamentResponse,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { Badge } from './ui/atoms/badge.js';
import { Card } from './ui/atoms/card.js';
import { messages } from '../i18n/messages.en.js';

export function LiveConsoleRoute({
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const listTournaments = api.listActiveTournaments;
    (listTournaments ? listTournaments(organizationAlias) : Promise.resolve([]))
      .then((loaded) => {
        if (!active) return;
        setTournaments(loaded);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setTournaments([]);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [api, organizationAlias]);

  return (
    <div className="cl-live-console" style={{ display: 'grid', gap: 'var(--cl-space-6)' }}>
      <header>
        <h1 style={{ margin: '0 0 var(--cl-space-2)', fontSize: 'var(--cl-font-size-2xl)' }}>
          {intl.formatMessage(messages.navLiveConsole)}
        </h1>
        <p style={{ margin: 0, color: 'var(--cl-text-muted)' }}>
          Consola de operaciones en vivo para torneos y partidos en juego.
        </p>
      </header>

      {loading ? (
        <p>Cargando operaciones en vivo…</p>
      ) : tournaments.length === 0 ? (
        <Card>
          <div style={{ padding: 'var(--cl-space-6)', textAlign: 'center' }}>
            <p style={{ margin: '0 0 var(--cl-space-4)', color: 'var(--cl-text-muted)' }}>
              No hay torneos activos en esta organización.
            </p>
            <a
              className="cl-btn cl-btn--primary cl-focusable"
              href={`/control/${organizationAlias}/tournaments/new`}
              onClick={controlLinkClick(`/control/${organizationAlias}/tournaments/new`)}
            >
              Crear torneo
            </a>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
          {tournaments.map((tournament) => (
            <Card key={tournament.tournamentId}>
              <div
                style={{
                  padding: 'var(--cl-space-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--cl-space-3)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 'var(--cl-space-2)',
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: 'var(--cl-font-size-lg)' }}>
                      {tournament.name}
                    </h2>
                    <span
                      style={{ fontSize: 'var(--cl-font-size-sm)', color: 'var(--cl-text-muted)' }}
                    >
                      {tournament.alias}
                    </span>
                  </div>
                  <Badge
                    className={
                      tournament.status === 'started'
                        ? 'cl-state--live'
                        : tournament.status === 'finished'
                          ? 'cl-state--positive'
                          : 'cl-state--upcoming'
                    }
                    label={
                      tournament.status === 'started'
                        ? 'EN VIVO'
                        : tournament.status === 'finished'
                          ? 'FINALIZADO'
                          : 'PRÓXIMO'
                    }
                  />
                </div>

                <div style={{ display: 'flex', gap: 'var(--cl-space-3)', flexWrap: 'wrap' }}>
                  <a
                    className="cl-btn cl-btn--secondary cl-focusable"
                    href={`/control/${organizationAlias}/tournaments/${tournament.alias}/matches-view`}
                    onClick={controlLinkClick(
                      `/control/${organizationAlias}/tournaments/${tournament.alias}/matches-view`,
                    )}
                  >
                    Ver partidos
                  </a>
                  <a
                    className="cl-btn cl-btn--secondary cl-focusable"
                    href={`/control/${organizationAlias}/tournaments/${tournament.alias}/reports`}
                    onClick={controlLinkClick(
                      `/control/${organizationAlias}/tournaments/${tournament.alias}/reports`,
                    )}
                  >
                    Reportes de partido
                  </a>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
