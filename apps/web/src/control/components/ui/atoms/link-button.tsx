import type { AnchorHTMLAttributes } from 'react';
import type { ButtonVariant } from './button.js';

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly variant?: ButtonVariant;
}

/**
 * `Button`'s classes on a real `<a href>` — for a primary action that
 * navigates rather than mutates in place, where a native `<button>` would
 * cost the operator right-click/middle-click "open in new tab" and a
 * meaningful `href` to hover over. Every call site that needs this used to
 * hand-roll it (`TournamentSummaryCard.tsx`, `callout-banner.tsx`,
 * `LiveConsoleTemplate.tsx` — see `KNOWN_HANDWRITTEN_CLASSES` in
 * `scripts/check-ui-ownership.mjs`); this is the owned primitive that gap
 * was recorded against, for new call sites to use instead of adding to it.
 */
export function LinkButton({
  variant = 'primary',
  className = '',
  ...rest
}: LinkButtonProps): React.JSX.Element {
  const chamfer = className.includes('cl-chamfer') ? '' : 'cl-chamfer cl-chamfer--control ';
  return (
    <a
      className={`cl-btn cl-btn--${variant} ${chamfer}cl-focusable ${className}`.trim()}
      {...rest}
    />
  );
}
