import { useState } from 'react';
import { BracketCanvas } from './BracketCanvas.js';
import { Button } from './ui/button.js';
import type { CanvasMatch } from '../lib/bracket-canvas.js';
import { canRedo, canUndo, initHistory, push, redo, undo } from '../lib/history.js';
import { isDirty, randomizeUnlocked, toggleLock, type SeedAssignment } from '../lib/seeding.js';
import { mutationFeedback } from '../lib/mutation-feedback.js';

/**
 * A6 — seed assignment beside the bracket it produces (0024).
 *
 * Two panes because they answer different questions: the list is what the
 * operator changes, the canvas is what the change means. Locks live on the
 * list; the canvas is read-only, because bracket shape is engine-derived and
 * dragging a match somewhere else would be editing a picture of the truth.
 */
export function SeedingBuilderPage({
  organizationAlias,
  tournamentName,
  seeds,
  matches,
  names = {},
  hasRecordedResults,
  onPublish,
  random,
}: {
  readonly organizationAlias: string;
  readonly tournamentName: string;
  readonly seeds: readonly SeedAssignment[];
  readonly matches: readonly CanvasMatch[];
  readonly names?: Readonly<Record<string, string>>;
  readonly hasRecordedResults: boolean;
  readonly onPublish?: (seeds: readonly SeedAssignment[]) => Promise<void> | void;
  readonly random?: () => number;
}): React.JSX.Element {
  const [history, setHistory] = useState(() => initHistory<readonly SeedAssignment[]>(seeds));
  const [zoom, setZoom] = useState(1);
  const current = history.present;

  // A courtesy, not the authority: the API classifies the same change and
  // refuses it there. This only spares the operator a round-trip.
  const feedback = mutationFeedback({ mutationClass: 'blocked_after_results', hasRecordedResults });
  const blocked = feedback.kind === 'blocked';

  const apply = (next: readonly SeedAssignment[]): void => setHistory((state) => push(state, next));

  return (
    <section aria-label="Sembrado y llave" style={stackStyle}>
      <header style={headerStyle}>
        <div>
          <p style={metaStyle}>
            {organizationAlias} &gt; {tournamentName}
          </p>
          <h1 style={titleStyle}>Sembrado</h1>
        </div>
        <div style={actionsStyle}>
          <Button
            disabled={!canUndo(history)}
            onClick={() => setHistory(undo)}
            type="button"
            variant="secondary"
          >
            Deshacer
          </Button>
          <Button
            disabled={!canRedo(history)}
            onClick={() => setHistory(redo)}
            type="button"
            variant="secondary"
          >
            Rehacer
          </Button>
          <Button
            disabled={blocked}
            onClick={() => apply(randomizeUnlocked(current, random))}
            type="button"
            variant="secondary"
          >
            Sortear no fijados
          </Button>
          <Button
            disabled={blocked || !isDirty(current, seeds)}
            onClick={() => void onPublish?.(current)}
            type="button"
          >
            Publicar sembrado
          </Button>
        </div>
      </header>

      {blocked && (
        <p className="cl-inline-alert" role="alert">
          {feedback.message}
        </p>
      )}

      <div style={panesStyle}>
        <div className="cl-card cl-chamfer cl-chamfer--control" style={listStyle}>
          <h2 style={paneTitleStyle}>Orden de siembra</h2>
          <ol aria-label="Orden de siembra" style={seedListStyle}>
            {current.map((assignment) => (
              <li key={assignment.seed} style={seedRowStyle}>
                <span style={seedNumberStyle}>{assignment.seed}</span>
                <span>{names[assignment.entrantId] ?? assignment.entrantId}</span>
                <Button
                  aria-label={`${assignment.locked ? 'Liberar' : 'Fijar'} siembra ${assignment.seed}`}
                  aria-pressed={assignment.locked}
                  disabled={blocked}
                  onClick={() => apply(toggleLock(current, assignment.seed))}
                  type="button"
                  variant="secondary"
                >
                  {assignment.locked ? 'Fijado' : 'Libre'}
                </Button>
              </li>
            ))}
          </ol>
          {current.length === 0 && <p style={mutedStyle}>Esta fase no tiene participantes.</p>}
        </div>

        <div className="cl-card cl-chamfer cl-chamfer--control" style={canvasPaneStyle}>
          <h2 style={paneTitleStyle}>Llave generada</h2>
          <BracketCanvas matches={matches} onZoomChange={setZoom} zoom={zoom} />
        </div>
      </div>
    </section>
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
const panesStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(240px, 1fr) 3fr',
  gap: 'var(--cl-space-4)',
  alignItems: 'start',
};
const listStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-3)' };
const canvasPaneStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-3)' };
const paneTitleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  color: 'var(--cl-text-muted)',
};
const seedListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--cl-space-2)',
};
const seedRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2rem 1fr auto',
  gap: 'var(--cl-space-2)',
  alignItems: 'center',
};
const seedNumberStyle: React.CSSProperties = {
  fontFamily: 'var(--cl-font-mono)',
  color: 'var(--cl-text-muted)',
};
const mutedStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
};
