/**
 * Copied from shadcn/ui 2.3.0 (MIT) and rewritten onto CopaLibre's tokens.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * `inverse` lifts the card off its band instead of sinking into it — the
   * reference's own reversal, for a card that *is* the section rather than one
   * of several entries in it. It overrides the alternation rather than adding a
   * depth to it, so a page cannot end up with three shades of the same idea.
   */
  readonly variant?: 'default' | 'inverse';
}

export function Card({
  className = '',
  role,
  variant = 'default',
  ...rest
}: CardProps): React.JSX.Element {
  const computedRole =
    role ?? (rest['aria-label'] || rest['aria-labelledby'] ? 'region' : undefined);
  const inverse = variant === 'inverse' ? ' cl-card--inverse' : '';
  const classes = className.includes('cl-chamfer')
    ? `cl-card${inverse} ${className}`
    : `cl-card${inverse} cl-chamfer cl-chamfer--control ${className}`;
  return <div className={classes.trim()} role={computedRole} {...rest} />;
}

export function CardHeader({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={`cl-card__header ${className}`} {...rest} />;
}

export function CardTitle({
  className = '',
  ...rest
}: HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return <h3 className={`cl-card__title ${className}`} {...rest} />;
}

export function CardDescription({
  className = '',
  ...rest
}: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={`cl-card__description ${className}`} {...rest} />;
}

export function CardContent({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={`cl-card__content cl-card__body ${className}`} {...rest} />;
}

export function CardFooter({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={`cl-card__footer ${className}`} {...rest} />;
}

export function CardSection({
  className = '',
  ...rest
}: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <section className={`cl-band ${className}`} {...rest} />;
}
