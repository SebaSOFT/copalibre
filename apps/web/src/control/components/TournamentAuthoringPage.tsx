import { useEffect, useMemo, useState } from 'react';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import type { DisciplineOption } from '../lib/wizard.js';
import { TournamentSetupWizard } from './TournamentSetupWizard.js';

export function TournamentAuthoringPage({
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
  const [disciplines, setDisciplines] = useState<readonly DisciplineOption[]>([]);
  const [status, setStatus] = useState('Cargando disciplinas...');

  useEffect(() => {
    let live = true;
    api
      .listDisciplines()
      .then((loaded) => {
        if (!live) return;
        setDisciplines(loaded);
        setStatus(loaded.length === 0 ? 'No hay disciplinas instaladas.' : '');
      })
      .catch(() => {
        if (live) setStatus('No se pudieron cargar las disciplinas.');
      });
    return () => {
      live = false;
    };
  }, [api]);

  if (disciplines.length === 0) return <p className="cl-inline-alert">{status}</p>;

  return (
    <>
      {status !== '' && <p className="cl-inline-alert">{status}</p>}
      <TournamentSetupWizard
        disciplines={disciplines}
        onSubmit={(request) => {
          setStatus('Creando torneo...');
          api
            .createTournament(organizationAlias, request)
            .then((created) => setStatus(`Torneo creado: ${created.alias}`))
            .catch(() => setStatus('No se pudo crear el torneo.'));
        }}
      />
    </>
  );
}
