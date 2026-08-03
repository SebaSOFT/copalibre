import { useEffect, useMemo, useState } from 'react';
import {
  createControlApiClient,
  type ControlApiClient,
  type RegistrationResponse,
} from '../lib/api-client.js';
import { RegistrationReviewPage, type ReviewRegistrationRow } from './RegistrationReviewPage.js';

export function RegistrationReviewRoute({
  organizationAlias,
  tournamentAlias,
  client,
  now = new Date().toISOString(),
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client?: ControlApiClient;
  readonly now?: string;
}): React.JSX.Element {
  const api = useMemo(
    () => client ?? createControlApiClient({ fetch: globalThis.fetch.bind(globalThis) }),
    [client],
  );
  const [rows, setRows] = useState<readonly ReviewRegistrationRow[]>([]);
  const [status, setStatus] = useState('Cargando inscripciones...');

  useEffect(() => {
    let live = true;
    api
      .listRegistrations(organizationAlias, tournamentAlias)
      .then((loaded) => {
        if (!live) return;
        setRows(loaded.map(toReviewRow));
        setStatus('');
      })
      .catch(() => {
        if (live) setStatus('No se pudieron cargar las inscripciones.');
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias]);

  if (status !== '' && rows.length === 0) return <p className="cl-inline-alert">{status}</p>;

  return (
    <RegistrationReviewPage
      organizationAlias={organizationAlias}
      tournamentName={tournamentAlias}
      rows={rows}
      now={now}
      onBulkReview={(request) =>
        api.bulkReview(organizationAlias, tournamentAlias, request).then((result) => {
          const updated = new Map(result.applied.map((one) => [one.entrantId, one]));
          setRows((current) =>
            current.map((row) => {
              const next = updated.get(row.entrantId);
              return next === undefined ? row : { ...row, status: next.status };
            }),
          );
        })
      }
      onReview={(entrantId, request) =>
        api
          .reviewRegistration(organizationAlias, tournamentAlias, entrantId, request)
          .then((next) =>
            setRows((current) =>
              current.map((row) =>
                row.entrantId === next.entrantId ? { ...row, status: next.status } : row,
              ),
            ),
          )
      }
    />
  );
}

function toReviewRow(row: RegistrationResponse): ReviewRegistrationRow {
  const displayName = row.teamId ?? row.personId ?? row.entrantId;
  return {
    entrantId: row.entrantId,
    displayName,
    status: row.status,
    submittedAt: '',
    contactEmail: 'No disponible en esta respuesta',
    // RegistrationResponse identifies the entrant, not its members. Do not
    // present the team identifier as a person until the API supplies members.
    teamMembers: [],
    experience: 'No registrada',
    requiresCheckIn: false,
  };
}
