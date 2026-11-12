import type { SVGProps } from 'react';
import {
  Activity,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Info,
  Languages,
  MapPin,
  Menu,
  Minus,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  Timer,
  Triangle,
  TriangleAlert,
  Trophy,
  Upload,
  UserRound,
  Users,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  IconBallBasketball,
  IconBallFootball,
  IconBallTennis,
  IconCards,
  IconPodium,
  IconScoreboard,
} from '@tabler/icons-react';
import { ICON_TOKENS } from '@copalibre/design-tokens';
import {
  ICON_REGISTRY,
  iconClassName,
  iconEntry,
  resolveIconName,
  type IconSize,
} from '../../../../lib/icon-registry.js';

type IconAccessibilityProps =
  | { readonly decorative?: true; readonly label?: never }
  | { readonly decorative: false; readonly label: string };

export type IconProps = Omit<
  SVGProps<SVGSVGElement>,
  'aria-hidden' | 'aria-label' | 'name' | 'size'
> & {
  readonly name: string;
  readonly size?: IconSize;
} & IconAccessibilityProps;

export function Icon({
  name,
  size = 20,
  decorative = true,
  label,
  className = '',
  ...props
}: IconProps): React.JSX.Element | null {
  const resolvedName = resolveIconName(name);
  if (!decorative && !label) {
    throw new Error(`Meaningful icon "${resolvedName}" requires an accessible label.`);
  }

  const entry = iconEntry(resolvedName);
  const pixelSize =
    size === 16
      ? ICON_TOKENS.size.inline
      : size === 24
        ? ICON_TOKENS.size.header
        : ICON_TOKENS.size.control;
  if (entry.set === 'custom') {
    return (
      <svg
        {...props}
        aria-hidden={decorative ? 'true' : undefined}
        aria-label={decorative ? undefined : label}
        className={iconClassName(entry, className)}
        fill="none"
        height={pixelSize}
        role={decorative ? undefined : 'img'}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={ICON_TOKENS.stroke}
        viewBox="0 0 24 24"
        width={pixelSize}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l2.5 2.5" />
      </svg>
    );
  }
  const Glyph =
    entry.set === 'tabler'
      ? {
          basketball: IconBallBasketball,
          football: IconBallFootball,
          tennis: IconBallTennis,
          podium: IconPodium,
          scoreboard: IconScoreboard,
          cards: IconCards,
        }[resolvedName as 'basketball' | 'football' | 'tennis' | 'podium' | 'scoreboard' | 'cards']
      : {
          activity: Activity,
          calendar: CalendarDays,
          check: Check,
          club: Shield,
          clock: Clock,
          copy: Copy,
          download: Download,
          event: Activity,
          export: Download,
          'external-link': ExternalLink,
          info: Info,
          language: Languages,
          menu: Menu,
          more: MoreHorizontal,
          pause: Pause,
          play: Play,
          retry: RotateCcw,
          'start-clock': Timer,
          team: Users,
          trophy: Trophy,
          upload: Upload,
          user: UserRound,
          venue: MapPin,
          warning: ShieldAlert,
          offline: WifiOff,
          close: X,
          'zoom-in': ZoomIn,
          'zoom-out': ZoomOut,
          'pause-clock': Pause,
          'chevron-down': ChevronDown,
          alert: TriangleAlert,
          minus: Minus,
          live: Circle,
          winner: Triangle,
          'winner-away': Triangle,
          loser: Triangle,
        }[
          resolvedName as Exclude<
            keyof typeof ICON_REGISTRY,
            'basketball' | 'football' | 'tennis' | 'podium' | 'scoreboard' | 'cards' | 'unknown'
          >
        ];
  if (!Glyph) return null;
  return (
    <Glyph
      {...props}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : label}
      className={iconClassName(entry, className)}
      color="currentColor"
      {...(entry.fill ? { fill: 'currentColor' } : {})}
      role={decorative ? undefined : 'img'}
      size={pixelSize}
      strokeWidth={ICON_TOKENS.stroke}
    />
  );
}
