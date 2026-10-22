import { Icon } from '../atoms/icon.js';

export type EventSyncState = 'queued' | 'sent' | 'confirmed' | 'refused';

export interface EventSyncMarkProps {
  readonly state: EventSyncState;
  readonly acknowledged: boolean;
  readonly labels: Readonly<Record<EventSyncState, string>>;
  readonly refusalReason?: string;
}

const ICONS: Readonly<Record<EventSyncState, string>> = {
  queued: 'clock',
  sent: 'activity',
  confirmed: 'check',
  refused: 'warning',
};

/** Queue-derived event state; confirmation requires an explicit server acknowledgement. */
export function EventSyncMark({
  state,
  acknowledged,
  labels,
  refusalReason,
}: EventSyncMarkProps): React.JSX.Element {
  const visibleState = state === 'confirmed' && !acknowledged ? 'sent' : state;
  const refused = visibleState === 'refused';

  return (
    <span
      className="cl-event-sync-mark"
      data-state={visibleState}
      role={refused ? 'alert' : 'status'}
    >
      <Icon name={ICONS[visibleState]} />
      <span>{labels[visibleState]}</span>
      {refused && refusalReason !== undefined && <span>{refusalReason}</span>}
    </span>
  );
}
