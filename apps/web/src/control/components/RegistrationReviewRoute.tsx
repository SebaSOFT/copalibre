import { useEffect, useMemo, useState } from 'react';
import {
  createControlApiClient,
  type CsvImportPreviewResponse,
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
  const [csv, setCsv] = useState<CsvImportPreviewResponse>();
  const [csvStatus, setCsvStatus] = useState('');
  const csvApi = api as Required<
    Pick<ControlApiClient, 'createCsvImport' | 'fetchCsvImport' | 'commitCsvImport'>
  >;

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
    <>
      <section
        aria-label="Importar participantes"
        className="cl-card cl-chamfer cl-chamfer--control"
      >
        <label>
          CSV de participantes
          <input
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              void file.text().then((sourceCsv) =>
                csvApi
                  .createCsvImport(organizationAlias, tournamentAlias, {
                    target: 'team',
                    sourceCsv,
                  })
                  .then((created) => {
                    setCsv(created);
                    setCsvStatus('Validación en cola.');
                    return csvApi.fetchCsvImport(
                      organizationAlias,
                      tournamentAlias,
                      created.importId,
                    );
                  })
                  .then((preview) => {
                    setCsv(preview);
                    setCsvStatus(preview.status);
                  })
                  .catch(() => setCsvStatus('No se pudo crear la importación.')),
              );
            }}
            type="file"
          />
        </label>
        {csvStatus && <p className="cl-inline-alert">{csvStatus}</p>}
        {csv?.preview && (
          <div>
            <p>{csv.preview.valid ? 'Preview válido.' : 'Preview con errores.'}</p>
            {csv.preview.errors.map((error) => (
              <p key={error.message}>{error.message}</p>
            ))}
            {csv.preview.rows
              .filter((row) => row.errors.length > 0)
              .map((row) => (
                <p key={row.rowNumber}>
                  Fila {row.rowNumber}: {row.errors.map((error) => error.message).join(', ')}
                </p>
              ))}
            <button
              disabled={!csv.preview.valid || csv.status !== 'review-ready'}
              onClick={() =>
                void csvApi
                  .commitCsvImport(organizationAlias, tournamentAlias, csv.importId, csv.sourceHash)
                  .then((next) => {
                    setCsv(next);
                    setCsvStatus('Importación confirmada.');
                  })
              }
              type="button"
            >
              Confirmar importación
            </button>
          </div>
        )}
      </section>
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
    </>
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
