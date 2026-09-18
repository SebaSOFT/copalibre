import { useEffect, useRef, useState } from 'react';

export interface ResponsivePlayerNameProps {
  readonly firstName?: string;
  readonly lastName?: string;
  /** Parsed into first/last (split on the first space) when discrete fields aren't given. */
  readonly fullName?: string;
  /** ISO 3166-1 alpha-2. Absent renders every tier with no flag, not a placeholder icon. */
  readonly nationalityCode?: string;
  readonly className?: string;
  readonly style?: React.CSSProperties;
}

type Tier = 'full' | 'medium' | 'compact' | 'minimal';

const TIER_BREAKPOINTS: readonly { readonly minWidth: number; readonly tier: Tier }[] = [
  { minWidth: 220, tier: 'full' },
  { minWidth: 150, tier: 'medium' },
  { minWidth: 85, tier: 'compact' },
  { minWidth: 0, tier: 'minimal' },
];

function tierForWidth(width: number): Tier {
  return TIER_BREAKPOINTS.find((candidate) => width >= candidate.minWidth)?.tier ?? 'minimal';
}

function nameParts(
  firstName: string | undefined,
  lastName: string | undefined,
  fullName: string | undefined,
): { readonly first: string; readonly last: string } {
  if (firstName !== undefined || lastName !== undefined) {
    return { first: firstName ?? '', last: lastName ?? '' };
  }
  const trimmed = (fullName ?? '').trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { first: trimmed, last: '' };
  return { first: trimmed.slice(0, spaceIndex), last: trimmed.slice(spaceIndex + 1) };
}

function initial(name: string): string {
  return name.length > 0 ? `${name.charAt(0).toUpperCase()}.` : '';
}

/** Unicode regional-indicator flag from an ISO 3166-1 alpha-2 code — no image asset. */
function flagEmoji(code: string): string | undefined {
  if (!/^[A-Za-z]{2}$/.test(code)) return undefined;
  const codePoints = [...code.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}

function textFor(tier: Tier, first: string, last: string): string {
  switch (tier) {
    case 'full':
    case 'medium':
      return [first, last].filter(Boolean).join(' ');
    case 'compact':
      return [initial(first), last].filter(Boolean).join(' ');
    case 'minimal':
    default:
      return [initial(first), initial(last)].filter(Boolean).join(' ');
  }
}

/**
 * A player identity that degrades across four tiers as its container narrows
 * — `[Flag] First Last` → `First Last` → `F. Last` → `F. L.` — instead of
 * overflowing or ellipsis-truncating (openspec 0247).
 */
export function ResponsivePlayerName({
  firstName,
  lastName,
  fullName,
  nationalityCode,
  className,
  style,
}: ResponsivePlayerNameProps): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const [tier, setTier] = useState<Tier>('full');

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    // An unmeasured layout (width 0 — a test environment with no real layout
    // engine, or a not-yet-painted frame) keeps the safe default (`full`)
    // rather than reading it as "narrower than every tier", mirroring
    // `EntrantName`'s own safe-default-until-measured behavior.
    const update = (): void => {
      if (element.clientWidth > 0) setTier(tierForWidth(element.clientWidth));
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);

  const { first, last } = nameParts(firstName, lastName, fullName);
  const wholeName = [first, last].filter(Boolean).join(' ');
  const flag =
    tier === 'full' && nationalityCode !== undefined ? flagEmoji(nationalityCode) : undefined;
  const accessibleLabel = [wholeName, nationalityCode].filter(Boolean).join(', ');

  return (
    <span
      aria-label={accessibleLabel || undefined}
      className={`cl-responsive-player-name ${className ?? ''}`.trim()}
      data-testid="responsive-player-name"
      ref={ref}
      style={style}
      title={wholeName || undefined}
    >
      {flag !== undefined && <span aria-hidden="true">{flag} </span>}
      {textFor(tier, first, last)}
    </span>
  );
}
