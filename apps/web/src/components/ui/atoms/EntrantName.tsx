import { resultStateIcon } from '../../../lib/result-state.js';
import { Icon } from './icon.js';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

interface SyncGroupState {
  readonly members: Map<symbol, boolean>;
  readonly listeners: Set<() => void>;
}

const syncGroups = new Map<string, SyncGroupState>();

function isGroupOverflowing(group: SyncGroupState): boolean {
  for (const overflowing of group.members.values()) {
    if (overflowing) return true;
  }
  return false;
}

function getOrCreateSyncGroup(groupKey: string): SyncGroupState {
  let group = syncGroups.get(groupKey);
  if (!group) {
    group = { members: new Map(), listeners: new Set() };
    syncGroups.set(groupKey, group);
  }
  return group;
}

function notifySyncGroup(group: SyncGroupState): void {
  for (const listener of group.listeners) listener();
}

function cleanupSyncGroup(groupKey: string): void {
  const group = syncGroups.get(groupKey);
  if (group && group.members.size === 0 && group.listeners.size === 0) {
    syncGroups.delete(groupKey);
  }
}

function subscribeSyncGroup(groupKey: string | undefined, listener: () => void): () => void {
  if (groupKey === undefined) return () => undefined;
  const group = getOrCreateSyncGroup(groupKey);
  group.listeners.add(listener);
  return () => {
    group.listeners.delete(listener);
    cleanupSyncGroup(groupKey);
  };
}

function getSyncGroupSnapshot(groupKey: string | undefined): boolean {
  if (groupKey === undefined) return false;
  const group = syncGroups.get(groupKey);
  return group ? isGroupOverflowing(group) : false;
}

function updateSyncGroupMember(groupKey: string, memberId: symbol, overflowing: boolean): void {
  const group = getOrCreateSyncGroup(groupKey);
  if (group.members.get(memberId) === overflowing) return;
  group.members.set(memberId, overflowing);
  notifySyncGroup(group);
}

function removeSyncGroupMember(groupKey: string, memberId: symbol): void {
  const group = syncGroups.get(groupKey);
  if (!group) return;
  const existed = group.members.delete(memberId);
  cleanupSyncGroup(groupKey);
  if (existed) notifySyncGroup(group);
}

/**
 * Keeps a tournament entrant identifiable in narrow surfaces without inventing
 * another label: resolved entrants use persisted abbreviations; pending sources
 * use the localized compact wording their caller supplies.
 */
export function EntrantName({
  fullName,
  abbreviation,
  className,
  inline = false,
  pending = false,
  showPendingIcon = true,
  compact: preferCompact = false,
  syncGroup,
  onOverflowChange,
}: {
  readonly fullName: string;
  readonly abbreviation?: string;
  readonly className?: string;
  /** Flow within surrounding text, inheriting its font, size and emphasis. */
  readonly inline?: boolean;
  readonly pending?: boolean;
  /** Shows the upcoming icon before pending labels; compact cards already carry a state icon in their gutter. */
  readonly showPendingIcon?: boolean;
  /** Explicit dense presentations remain meaningful before hydration. */
  readonly compact?: boolean;
  /** Coordinates compact fallback across separate island mounts sharing one match node. */
  readonly syncGroup?: string;
  /** Reports whether this label overflows its box so sibling sides can coordinate one form. */
  readonly onOverflowChange?: (overflowing: boolean) => void;
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const [memberId] = useState(() => Symbol());
  const onOverflowChangeRef = useRef(onOverflowChange);
  const [compact, setCompact] = useState(false);
  const overflowScrollWidthRef = useRef(0);
  const groupCompact = useSyncExternalStore(
    (listener) => subscribeSyncGroup(syncGroup, listener),
    () => getSyncGroupSnapshot(syncGroup),
    () => false,
  );
  const showAbbreviation = (compact || groupCompact || preferCompact) && abbreviation !== undefined;

  useEffect(() => {
    onOverflowChangeRef.current = onOverflowChange;
  }, [onOverflowChange]);

  useEffect(() => {
    const element = ref.current;
    if (!element || abbreviation === undefined || typeof ResizeObserver === 'undefined') return;
    overflowScrollWidthRef.current = 0;
    const setOverflow = (overflowing: boolean): void => {
      setCompact(overflowing);
      onOverflowChangeRef.current?.(overflowing);
      if (syncGroup !== undefined) updateSyncGroupMember(syncGroup, memberId, overflowing);
    };
    const update = (): void => {
      if (overflowScrollWidthRef.current > 0) {
        if (element.clientWidth >= overflowScrollWidthRef.current) {
          overflowScrollWidthRef.current = 0;
          setOverflow(false);
        }
        return;
      }
      const overflowing = element.scrollWidth > element.clientWidth;
      if (overflowing) overflowScrollWidthRef.current = element.scrollWidth;
      setOverflow(overflowing);
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => {
      observer.disconnect();
      overflowScrollWidthRef.current = 0;
      onOverflowChangeRef.current?.(false);
      if (syncGroup !== undefined) removeSyncGroupMember(syncGroup, memberId);
    };
  }, [abbreviation, fullName, memberId, syncGroup]);

  return (
    <span
      className={`cl-entrant-name ${inline ? 'cl-entrant-name--inline' : ''} ${pending ? 'cl-entrant-name--pending' : ''} ${className ?? ''}`.trim()}
      data-testid="entrant-name"
      ref={ref}
      aria-label={fullName}
      title={showAbbreviation ? undefined : fullName}
    >
      {pending && showPendingIcon && (
        <>
          <Icon name={resultStateIcon('upcoming')} size={16} />{' '}
        </>
      )}
      {showAbbreviation ? <abbr title={fullName}>{abbreviation}</abbr> : fullName}
    </span>
  );
}
