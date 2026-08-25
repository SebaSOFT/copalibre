/**
 * Copied from shadcn/ui 2.3.0 (MIT) and rewritten onto CopaLibre's tokens.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { HTMLAttributes } from 'react';

export function Card({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={`cl-card cl-chamfer cl-chamfer--control ${className}`} {...rest} />;
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
  return <div className={`cl-card__content ${className}`} {...rest} />;
}

export function CardFooter({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={`cl-card__footer ${className}`} {...rest} />;
}
