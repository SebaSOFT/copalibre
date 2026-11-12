/**
 * Every icon the interface draws, by the name callers use.
 *
 * An entry may be drawn filled (`fill`) or turned half a turn (`flip`), so one
 * outline shape can serve as two marks without a second asset. State shapes
 * live here rather than as text characters: the brand faces have no glyph for
 * a circle, triangle or caret, and a character the brand face lacks makes the
 * browser download a fallback font (a CJK or symbol face) just to draw it.
 */
export interface IconEntry {
  readonly set: 'lucide' | 'tabler' | 'custom';
  readonly name: string;
  readonly fill?: true;
  readonly flip?: true;
}

export const ICON_REGISTRY = {
  activity: { set: 'lucide', name: 'activity' },
  calendar: { set: 'lucide', name: 'calendar-days' },
  check: { set: 'lucide', name: 'check' },
  club: { set: 'lucide', name: 'shield' },
  clock: { set: 'lucide', name: 'clock' },
  copy: { set: 'lucide', name: 'copy' },
  download: { set: 'lucide', name: 'download' },
  event: { set: 'lucide', name: 'activity' },
  export: { set: 'lucide', name: 'download' },
  'external-link': { set: 'lucide', name: 'external-link' },
  info: { set: 'lucide', name: 'info' },
  language: { set: 'lucide', name: 'languages' },
  menu: { set: 'lucide', name: 'menu' },
  more: { set: 'lucide', name: 'ellipsis' },
  pause: { set: 'lucide', name: 'pause' },
  play: { set: 'lucide', name: 'play' },
  retry: { set: 'lucide', name: 'rotate-ccw' },
  'start-clock': { set: 'lucide', name: 'timer' },
  team: { set: 'lucide', name: 'users' },
  trophy: { set: 'lucide', name: 'trophy' },
  upload: { set: 'lucide', name: 'upload' },
  user: { set: 'lucide', name: 'user-round' },
  venue: { set: 'lucide', name: 'map-pin' },
  warning: { set: 'lucide', name: 'shield-alert' },
  offline: { set: 'lucide', name: 'wifi-off' },
  close: { set: 'lucide', name: 'x' },
  'zoom-in': { set: 'lucide', name: 'zoom-in' },
  'zoom-out': { set: 'lucide', name: 'zoom-out' },
  'pause-clock': { set: 'lucide', name: 'pause' },
  'chevron-down': { set: 'lucide', name: 'chevron-down' },
  alert: { set: 'lucide', name: 'triangle-alert' },
  minus: { set: 'lucide', name: 'minus' },
  live: { set: 'lucide', name: 'circle', fill: true },
  winner: { set: 'lucide', name: 'triangle', fill: true },
  'winner-away': { set: 'lucide', name: 'triangle', fill: true, flip: true },
  loser: { set: 'lucide', name: 'triangle', flip: true },
  basketball: { set: 'tabler', name: 'ball-basketball' },
  football: { set: 'tabler', name: 'ball-football' },
  tennis: { set: 'tabler', name: 'ball-tennis' },
  podium: { set: 'tabler', name: 'podium' },
  scoreboard: { set: 'tabler', name: 'scoreboard' },
  cards: { set: 'tabler', name: 'cards' },
  unknown: { set: 'custom', name: 'event' },
} as const satisfies Record<string, IconEntry>;

/** The entry for a name, read through the shared shape so `fill` and `flip` are always visible. */
export function iconEntry(name: IconName): IconEntry {
  return ICON_REGISTRY[name];
}

/** The classes every rendering of an entry carries, so the two icon atoms cannot diverge. */
export function iconClassName(entry: IconEntry, className = ''): string {
  return [
    'cl-icon',
    entry.set === 'tabler' ? 'cl-icon--tabler' : '',
    entry.flip ? 'cl-icon--flipped' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export type IconName = keyof typeof ICON_REGISTRY;
export type IconSize = 16 | 20 | 24;

export function isIconName(name: string): name is IconName {
  return Object.hasOwn(ICON_REGISTRY, name);
}

export function resolveIconName(name: string): IconName {
  return isIconName(name) ? name : 'unknown';
}
