import type { ReactNode, HTMLAttributes } from 'react';
import { spaceVar, type SpacingStep } from './spacing.js';

export type InlineAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type InlineJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

const ALIGN_ITEMS: Record<InlineAlign, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

const JUSTIFY_CONTENT: Record<InlineJustify, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
};

export interface InlineProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'className'> {
  readonly children: ReactNode;
  /** Horizontal gap between children, a token-scale step. */
  readonly gap?: SpacingStep;
  /** Cross-axis (vertical) alignment of children. */
  readonly align?: InlineAlign;
  /** Main-axis (horizontal) distribution of children. */
  readonly justify?: InlineJustify;
  /** Whether children may wrap to a new line at narrow widths. */
  readonly wrap?: boolean;
  /** Padding on all sides, a token-scale step. */
  readonly padding?: SpacingStep;
  readonly className?: string;
}

/** A horizontal layout primitive: absorbs the flex-row-with-gap shape every tier reinvented inline. */
export function Inline({
  children,
  gap = '0',
  align,
  justify,
  wrap = false,
  padding,
  className = '',
  ...rest
}: InlineProps): React.JSX.Element {
  return (
    <div
      className={`cl-inline ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        gap: spaceVar(gap),
        ...(align ? { alignItems: ALIGN_ITEMS[align] } : {}),
        ...(justify ? { justifyContent: JUSTIFY_CONTENT[justify] } : {}),
        ...(padding ? { padding: spaceVar(padding) } : {}),
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
