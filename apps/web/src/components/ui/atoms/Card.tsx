/**
 * Owns the public/broadcast surfaces' `cl-card` shape. A plain React
 * component, not an `.astro` one, so it composes identically from a `.tsx`
 * organism (`MatchCard.tsx`) and from an `.astro` one (`TournamentHero.astro`)
 * without a `client:*` directive on either side — nothing here is
 * interactive, so Astro renders it to static markup and ships no JavaScript
 * for it, the same as any other library atom on this surface.
 */
import type { ElementType, HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** The root element a card's semantics call for — a listing entry is an `<article>`, a page's own hero is a `<section>`. */
  readonly as?: 'div' | 'article' | 'section';
  readonly children?: ReactNode;
}

export function Card({
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const Component = Tag as ElementType;
  return (
    <Component className={`cl-card cl-chamfer ${className}`.trim()} {...rest}>
      {children}
    </Component>
  );
}

export function CardTitle({
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return (
    <p className={`cl-card__title ${className}`.trim()} {...rest}>
      {children}
    </p>
  );
}

export function CardDescription({
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return (
    <p className={`cl-card__description ${className}`.trim()} {...rest}>
      {children}
    </p>
  );
}
