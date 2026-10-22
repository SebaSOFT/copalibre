import { Icon } from '../atoms/icon.js';

export interface ConnectionStatusProps {
  readonly online: boolean;
  readonly queuedCount: number;
  readonly refusedCount: number;
  readonly lastSuccessfulSync?: string;
  readonly labels: {
    readonly online: string;
    readonly offline: string;
    readonly queuedCount: (count: number) => string;
    readonly refusedCount: (count: number) => string;
    readonly lastSuccessfulSync: (time: string) => string;
    readonly neverSynced: string;
  };
}

/** Persistent live-console connection and queue status. */
export function ConnectionStatus({
  online,
  queuedCount,
  refusedCount,
  lastSuccessfulSync,
  labels,
}: ConnectionStatusProps): React.JSX.Element {
  const refused = refusedCount > 0;
  const hasQueued = queuedCount > 0;
  const tone = refused ? 'red' : hasQueued ? 'amber' : 'neutral';
  const connectionLabel = online ? labels.online : labels.offline;

  return (
    <div aria-live="polite" className="cl-connection-status" data-tone={tone} role="status">
      <Icon name={refused ? 'warning' : online ? 'activity' : 'offline'} />
      <span className="cl-connection-status__connection">{connectionLabel}</span>
      {hasQueued && <span>{labels.queuedCount(queuedCount)}</span>}
      {refused && <span>{labels.refusedCount(refusedCount)}</span>}
      <span className="cl-connection-status__sync">
        {lastSuccessfulSync === undefined
          ? labels.neverSynced
          : labels.lastSuccessfulSync(lastSuccessfulSync)}
      </span>
    </div>
  );
}
