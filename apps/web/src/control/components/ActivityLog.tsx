import type { ActivityEntry } from '../lib/dashboard.js';

/**
 * The audit log, rendered as what it is: a record, in monospace, newest first.
 *
 * It shows the actor and the reason because those are the two questions asked
 * of an audit trail, and a feed that shows neither is decoration.
 */
export function ActivityLog({
  entries,
}: {
  readonly entries: readonly ActivityEntry[];
}): React.JSX.Element {
  return (
    <section aria-label="Actividad reciente">
      <h2>Actividad reciente</h2>
      {entries.length === 0 && <p>Sin actividad todavía.</p>}
      <ol style={{ fontFamily: 'var(--cl-font-mono)' }}>
        {entries.map((entry) => (
          <li key={entry.auditId}>
            <time dateTime={entry.occurredAt}>{entry.occurredAt}</time> {entry.action}{' '}
            <span>{entry.actor}</span>
            {entry.reason !== undefined && <em> — {entry.reason}</em>}
          </li>
        ))}
      </ol>
    </section>
  );
}
