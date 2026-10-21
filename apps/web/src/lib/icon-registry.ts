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
  basketball: { set: 'tabler', name: 'ball-basketball' },
  football: { set: 'tabler', name: 'ball-football' },
  tennis: { set: 'tabler', name: 'ball-tennis' },
  podium: { set: 'tabler', name: 'podium' },
  scoreboard: { set: 'tabler', name: 'scoreboard' },
  cards: { set: 'tabler', name: 'cards' },
  unknown: { set: 'custom', name: 'event' },
} as const;

export type IconName = keyof typeof ICON_REGISTRY;
export type IconSize = 16 | 20 | 24;

export function isIconName(name: string): name is IconName {
  return Object.hasOwn(ICON_REGISTRY, name);
}

export function resolveIconName(name: string): IconName {
  return isIconName(name) ? name : 'unknown';
}
