/**
 * Copied from shadcn/ui 2.3.0 (MIT) and rewritten onto CopaLibre's tokens.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { HTMLAttributes } from 'react';

/**
 * `eyebrow` and `section` are the operational-tag family (0223): chrome, not
 * state. They resolve to the chrome surface level, carry a border and set their
 * label in the mono face, which is what separates a label naming a region from
 * a badge reporting a condition. They are variants rather than components
 * because the anatomy — a bordered box holding a short uppercase word — is the
 * badge's, and a second implementation would be a second set of states to keep
 * correct.
 */
export type BadgeVariant = 'default' | 'eyebrow' | 'section';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Required: a badge is a colour *and* a word. */
  readonly label: string;
  /** Chrome tag sizing. Defaults to the state badge this component started as. */
  readonly variant?: BadgeVariant;
  /**
   * A live-condition marker. Inert under reduced motion — the stylesheet's
   * global accommodation stops the pulse, and the dot stays visible, because
   * the dot is the cue and the motion is only emphasis.
   */
  readonly dot?: boolean;
}

export function Badge({
  label,
  variant = 'default',
  dot = false,
  className = '',
  ...rest
}: BadgeProps): React.JSX.Element {
  const variantClass = variant === 'default' ? '' : `cl-badge--${variant}`;
  const classes = ['cl-badge', variantClass, className].filter(Boolean).join(' ');
  return (
    <span className={classes} {...rest}>
      {dot && <span aria-hidden="true" className="cl-badge__dot" data-testid="badge-dot" />}
      {label}
    </span>
  );
}
