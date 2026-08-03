import { useState } from 'react';
import { Button } from './ui/button.js';
import type { BulkReviewRequest, ReviewRegistrationRequest } from '../lib/api-client.js';
import {
  LOCK_EXPLANATION,
  initialReview,
  pageCount,
  teamMembershipActionsEnabled,
  setFilter,
  toggleAllVisible,
  toggleRow,
  visibleRows,
  type RegistrationRow,
  type StatusFilter,
} from '../lib/review.js';

export interface ReviewRegistrationRow extends RegistrationRow {
  readonly contactEmail: string;
  readonly teamMembers: readonly string[];
  readonly experience: string;
  readonly requiresCheckIn: boolean;
  readonly checkInClosesAt?: string;
}

const FILTERS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'accepted', label: 'Aceptados' },
  { value: 'refused', label: 'Rechazados' },
];

const STATUS_LABELS: Record<RegistrationRow['status'], string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  refused: 'Rechazada',
  withdrawn: 'Retirada',
  'checked-in': 'Check-in',
};

export function RegistrationReviewPage({
  organizationAlias,
  tournamentName,
  rows,
  now,
  onBulkReview,
  onReview,
}: {
  readonly organizationAlias: string;
  readonly tournamentName: string;
  readonly rows: readonly ReviewRegistrationRow[];
  readonly now: string;
  readonly onBulkReview?: (request: BulkReviewRequest) => Promise<void> | void;
  readonly onReview?: (
    entrantId: string,
    request: ReviewRegistrationRequest,
  ) => Promise<void> | void;
}): React.JSX.Element {
  const [state, setState] = useState(() => initialReview(10));
  const visible = visibleRows(rows, state) as readonly ReviewRegistrationRow[];
  const selected = new Set(state.selected);
  const allVisibleSelected =
    visible.length > 0 && visible.every((row) => state.selected.includes(row.entrantId));

  return (
    <section aria-label="Revisión de inscripciones" style={stackStyle}>
      <header style={headerStyle}>
        <div>
          <p style={metaStyle}>
            {organizationAlias} &gt; {tournamentName}
          </p>
          <h1 style={titleStyle}>Revisión de inscripciones</h1>
        </div>
        <div style={actionsStyle}>
          <select
            aria-label="Estado"
            className="cl-focusable"
            onChange={(event) =>
              setState((current) => setFilter(current, event.target.value as StatusFilter, rows))
            }
            style={selectStyle}
            value={state.filter}
          >
            {FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
          <Button
            disabled={state.selected.length === 0}
            onClick={() =>
              void onBulkReview?.({ entrantIds: state.selected, decision: 'accepted' })
            }
            type="button"
            variant="secondary"
          >
            Aprobar
          </Button>
          <Button
            disabled={state.selected.length === 0}
            onClick={() => void onBulkReview?.({ entrantIds: state.selected, decision: 'refused' })}
            type="button"
            variant="destructive-outline"
          >
            Rechazar
          </Button>
          <Button type="button">Exportar</Button>
        </div>
      </header>

      <div className="cl-card cl-chamfer cl-chamfer--control" style={tableStyle}>
        <div style={tableHeaderStyle}>
          <input
            aria-label="Seleccionar visibles"
            checked={allVisibleSelected}
            onChange={() => setState((current) => toggleAllVisible(current, rows))}
            type="checkbox"
          />
          <span>Nombre</span>
          <span>Estado</span>
          <span>Enviada</span>
        </div>
        {visible.map((row) => {
          const teamMembershipEnabled = teamMembershipActionsEnabled({
            requiresCheckIn: row.requiresCheckIn,
            checkInClosesAt: row.checkInClosesAt,
            status: row.status,
            now,
          });
          return (
            <details className="cl-focusable" key={row.entrantId} style={rowStyle}>
              <summary style={summaryStyle}>
                <input
                  aria-label={`Seleccionar ${row.displayName}`}
                  checked={selected.has(row.entrantId)}
                  onChange={() => setState((current) => toggleRow(current, row.entrantId))}
                  onClick={(event) => event.stopPropagation()}
                  type="checkbox"
                />
                <span>
                  <strong>{row.displayName}</strong>
                  <small style={smallStyle}>ID: {row.entrantId}</small>
                </span>
                <span className="cl-badge">{STATUS_LABELS[row.status]}</span>
                <time dateTime={row.submittedAt} style={smallStyle}>
                  {row.submittedAt}
                </time>
              </summary>
              <div style={detailStyle}>
                <FieldValue label="Contacto" value={row.contactEmail} />
                <FieldValue
                  label="Miembros del equipo"
                  value={
                    row.teamMembers.length === 0
                      ? 'No disponible en esta respuesta'
                      : row.teamMembers.join(', ')
                  }
                />
                <FieldValue label="Experiencia" value={row.experience} />
                <div style={detailActionsStyle}>
                  <Button type="button" variant="secondary">
                    Mensaje
                  </Button>
                  <Button disabled={!teamMembershipEnabled} type="button" variant="secondary">
                    Editar miembros
                  </Button>
                  <Button
                    onClick={() =>
                      void onReview?.(row.entrantId, {
                        decision: 'withdrawn',
                        reason: 'Revoked from registration review',
                      })
                    }
                    type="button"
                    variant="destructive-outline"
                  >
                    Revocar
                  </Button>
                </div>
                {!teamMembershipEnabled && (
                  <p className="cl-inline-alert" style={lockStyle}>
                    {LOCK_EXPLANATION}
                  </p>
                )}
              </div>
            </details>
          );
        })}
        {visible.length === 0 && <p>No hay inscripciones para este filtro.</p>}
      </div>

      <footer style={paginationStyle}>
        <span>
          Página {state.page} de {pageCount(rows, state)}
        </span>
      </footer>
    </section>
  );
}

function FieldValue({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div style={fieldValueStyle}>
      <span style={smallStyle}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const stackStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-6)' };
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'end',
  gap: 'var(--cl-space-4)',
  flexWrap: 'wrap',
};
const metaStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--cl-state-live)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
};
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-display)',
  fontSize: '3rem',
  textTransform: 'uppercase',
};
const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  flexWrap: 'wrap',
};
const selectStyle: React.CSSProperties = {
  minHeight: 44,
  background: 'var(--cl-surface-base)',
  color: 'var(--cl-text-primary)',
  border: '1px solid var(--cl-border-muted)',
  padding: 'var(--cl-space-2) var(--cl-space-3)',
};
const tableStyle: React.CSSProperties = { display: 'grid', gap: 0, padding: 0, overflow: 'hidden' };
const tableHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '44px 2fr 1fr 1fr',
  gap: 'var(--cl-space-3)',
  alignItems: 'center',
  padding: 'var(--cl-space-3) var(--cl-space-4)',
  borderBottom: '1px solid var(--cl-border-muted)',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
};
const rowStyle: React.CSSProperties = { borderBottom: '1px solid var(--cl-border-muted)' };
const summaryStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '44px 2fr 1fr 1fr',
  gap: 'var(--cl-space-3)',
  alignItems: 'center',
  padding: 'var(--cl-space-4)',
  cursor: 'pointer',
};
const smallStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
};
const detailStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 'var(--cl-space-4)',
  padding: '0 var(--cl-space-4) var(--cl-space-4) 64px',
};
const detailActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  flexWrap: 'wrap',
  alignItems: 'end',
};
const fieldValueStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-1)',
  background: 'var(--cl-surface-base)',
  padding: 'var(--cl-space-3)',
  border: '1px solid var(--cl-border-muted)',
};
const lockStyle: React.CSSProperties = { gridColumn: '1 / -1', margin: 0 };
const paginationStyle: React.CSSProperties = {
  color: 'var(--cl-text-secondary)',
  fontFamily: 'var(--cl-font-mono)',
};
