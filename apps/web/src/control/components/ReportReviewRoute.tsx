import { useEffect, useMemo, useState } from 'react';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import { KIND_LABEL, summaryOf, type ReportRow } from '../lib/reports.js';

/**
 * The pending participant reports/disputes queue (0032, task 2.3/7.1).
 *
 * Deliberately without a bulk action: design.md's mitigation for "a flood of
 * low-quality disputes" is that this queue is reviewed one at a time, and a
 * dismiss here never touches a match result — an operator who wants to act
 * on a submission does so through the existing correction workflow
 * separately, citing this report's id.
 */
export function ReportReviewRoute({
  organizationAlias,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const api = useMemo(
    () => client ?? createControlApiClient({ fetch: globalThis.fetch.bind(globalThis) }),
    [client],
  );
  const [rows, setRows] = useState<readonly ReportRow[]>([]);
  const [status, setStatus] = useState('Cargando reportes...');

  useEffect(() => {
    let live = true;
    api
      .listPendingReports?.(organizationAlias, tournamentAlias)
      .then((loaded) => {
        if (!live) return;
        setRows(loaded.map(toRow));
        setStatus('');
      })
      .catch(() => {
        if (live) setStatus('No se pudieron cargar los reportes.');
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias]);

  const dismiss = (reportId: string, reviewNote: string) =>
    api
      .reviewReport?.(organizationAlias, tournamentAlias, reportId, {
        status: 'dismissed',
        ...(reviewNote === '' ? {} : { reviewNote }),
      })
      .then(() => setRows((current) => current.filter((row) => row.reportId !== reportId)));

  return (
    <section
      aria-label="Reportes y disputas pendientes"
      className="cl-card cl-chamfer cl-chamfer--control"
    >
      <h1>Reportes y disputas pendientes</h1>
      {status !== '' && rows.length === 0 && <p className="cl-inline-alert">{status}</p>}
      {status === '' && rows.length === 0 && <p>No hay reportes ni disputas pendientes.</p>}
      <ul>
        {rows.map((row) => (
          <li key={row.reportId}>
            <article className="cl-card">
              <span className="cl-badge">{KIND_LABEL[row.kind]}</span>
              <p>{summaryOf(row)}</p>
              <p>
                <time dateTime={row.submittedAt}>{row.submittedAt}</time>
              </p>
              {row.evidence.length > 0 && (
                <ul aria-label="Evidencia adjunta">
                  {row.evidence.map((file) => (
                    <li key={file.evidenceId}>
                      {file.filename} — {file.validationStatus}
                    </li>
                  ))}
                </ul>
              )}
              <button onClick={() => void dismiss(row.reportId, '')} type="button">
                Descartar
              </button>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

function toRow(response: {
  reportId: string;
  matchId: string;
  kind: string;
  submittedByPersonId: string;
  submittedAt: string;
  reason?: string;
  status: string;
  evidence: readonly {
    evidenceId: string;
    filename: string;
    validationStatus: string;
  }[];
}): ReportRow {
  return {
    reportId: response.reportId,
    matchId: response.matchId,
    kind: response.kind as ReportRow['kind'],
    submittedByPersonId: response.submittedByPersonId,
    submittedAt: response.submittedAt,
    ...(response.reason === undefined ? {} : { reason: response.reason }),
    status: response.status as ReportRow['status'],
    evidence: response.evidence.map((file) => ({
      evidenceId: file.evidenceId,
      filename: file.filename,
      validationStatus: file.validationStatus as ReportRow['evidence'][number]['validationStatus'],
    })),
  };
}
