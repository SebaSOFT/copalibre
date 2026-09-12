/**
 * A numbered step, as a real heading.
 *
 * The number is a decorative marker beside the heading, not part of its text:
 * a screen reader announcing "3 Configure the discipline" reads a heading whose
 * name has a stray digit in front of it, and a list of such headings is harder
 * to navigate, not easier.
 *
 * It is a flex peer of the heading rather than a float or a list marker, so a
 * title that wraps to three lines at 188px — or at 200% zoom, which is the same
 * problem measured differently — keeps its number beside its first line instead
 * of letting the text flow underneath it.
 */
import type { ReactNode } from 'react';

export interface StepHeadingProps {
  /** The step's position in its sequence. Rendered in tabular figures. */
  readonly step: number;
  readonly title: string;
  /**
   * Which heading level this is in its page's outline. A step is not always an
   * `h2`; the page it sits in decides.
   */
  readonly level?: 2 | 3 | 4;
  readonly id?: string;
  /** Whatever the step says beneath its title. */
  readonly children?: ReactNode;
  readonly className?: string;
}

export function StepHeading({
  step,
  title,
  level = 3,
  id,
  children,
  className = '',
}: StepHeadingProps): React.JSX.Element {
  const Heading = `h${level}` as 'h2' | 'h3' | 'h4';
  return (
    <div className={className || undefined}>
      <div className="cl-step-heading">
        <span aria-hidden="true" className="cl-step-heading__marker cl-chamfer cl-chamfer--control">
          {step}
        </span>
        <Heading className="cl-step-heading__title" id={id}>
          {title}
        </Heading>
      </div>
      {children}
    </div>
  );
}
