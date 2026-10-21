import type { SVGProps } from 'react';
import {
  Activity,
  CalendarDays,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Languages,
  MapPin,
  Menu,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  Timer,
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
import { ICON_REGISTRY, resolveIconName, type IconSize } from '../../../../lib/icon-registry.js';

export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  'aria-hidden' | 'aria-label' | 'name' | 'size'
> {
  readonly name: string;
  readonly size?: IconSize;
  readonly decorative?: boolean;
  readonly label?: string;
}

export function Icon({
  name,
  size = 20,
  decorative = true,
  label,
  className = '',
  ...props
}: IconProps): React.JSX.Element | null {
  const resolvedName = resolveIconName(name);
  if (!decorative && !label && process.env.NODE_ENV !== 'production') {
    throw new Error(`Meaningful icon "${resolvedName}" requires an accessible label.`);
  }

  const entry = ICON_REGISTRY[resolvedName];
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
        className={`cl-icon ${className}`.trim()}
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
        }[
          resolvedName as Exclude<
            keyof typeof ICON_REGISTRY,
            'basketball' | 'football' | 'tennis' | 'podium' | 'scoreboard' | 'cards' | 'unknown'
          >
        ];
  if (!Glyph) return null;
  const tablerClass = entry.set === 'tabler' ? ' cl-icon--tabler' : '';
  return (
    <Glyph
      {...props}
      aria-hidden={decorative ? 'true' : undefined}
      aria-label={decorative ? undefined : label}
      className={`cl-icon${tablerClass} ${className}`.trim()}
      color="currentColor"
      role={decorative ? undefined : 'img'}
      size={pixelSize}
      strokeWidth={ICON_TOKENS.stroke}
    />
  );
}
