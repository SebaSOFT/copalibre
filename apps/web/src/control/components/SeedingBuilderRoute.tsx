import { useEffect, useMemo, useState } from 'react';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
  type SeedingResponse,
} from '../lib/api-client.js';
import type { SeedAssignment } from '../lib/seeding.js';
import { SeedingBuilderPage } from './SeedingBuilderPage.js';

export function SeedingBuilderRoute({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const api = useMemo(
    () => client ?? createControlApiClient({ fetch: globalThis.fetch.bind(globalThis) }),
    [client],
  );
  const [seeding, setSeeding] = useState<SeedingResponse | undefined>(undefined);
  const [status, setStatus] = useState('Cargando sembrado...');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    api
      .fetchSeeding(organizationAlias, tournamentAlias, stageNumber)
      .then((loaded) => {
        if (!live) return;
        setSeeding(loaded);
        setStatus('');
      })
      .catch(() => {
        if (live) setStatus('No se pudo cargar el sembrado.');
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, stageNumber]);

  if (seeding === undefined) return <p className="cl-inline-alert">{status}</p>;

  const assignments: readonly SeedAssignment[] = seeding.seeds.map((seed) => ({
    ...seed,
    locked: false,
  }));

  return (
    <>
      {notice !== '' && (
        <p className="cl-inline-alert" role="alert">
          {notice}
        </p>
      )}
      <SeedingBuilderPage
        hasRecordedResults={seeding.hasRecordedResults}
        matches={seeding.matches}
        onPublish={(seeds) =>
          api
            .publishSeeding(organizationAlias, tournamentAlias, stageNumber, {
              seeds: seeds.map((seed) => ({ seed: seed.seed, entrantId: seed.entrantId })),
            })
            .then((result) => setNotice(result.reason))
            .catch((error: unknown) =>
              // The server's own reason, not a status code: a 409 here says
              // "seeding cannot change once a result exists", which is the
              // sentence the operator needs.
              setNotice(
                error instanceof ControlApiError
                  ? error.message
                  : 'No se pudo publicar el sembrado.',
              ),
            )
        }
        organizationAlias={organizationAlias}
        seeds={assignments}
        tournamentName={tournamentAlias}
      />
    </>
  );
}
