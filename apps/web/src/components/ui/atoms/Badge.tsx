/**
 * Owns the public/broadcast surfaces' `cl-badge` shape. A plain React
 * component so it composes from both `.tsx` and `.astro` callers with no
 * `client:*` directive — see `Card.tsx`'s docstring for why that is safe for
 * a purely presentational atom.
 *
 * Takes children rather than a `label` string (unlike control's `Badge`
 * atom): a public badge sometimes wraps an icon and a label together
 * (`ResultLegend.astro`), which a single-string prop cannot express.
 */
import type { ElementType, HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLElement> {
  /** `p` matches a badge standing alone as a section's one line of chrome (`TournamentHero.astro`); every other caller wants the default inline `span`. */
  readonly as?: 'span' | 'p';
  readonly children?: ReactNode;
}

export function Badge({
  as: Tag = 'span',
  className = '',
  children,
  ...rest
}: BadgeProps): React.JSX.Element {
  const Component = Tag as ElementType;
  return (
    <Component className={`cl-badge ${className}`.trim()} {...rest}>
      {children}
    </Component>
  );
}
