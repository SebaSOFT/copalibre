import type { ReactNode } from 'react';
import { spaceVar, type SpacingStep } from './spacing.js';

export type StackAlign = 'start' | 'center' | 'end' | 'stretch';

const ALIGN_ITEMS: Record<StackAlign, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

export interface StackProps {
  readonly children: ReactNode;
  /** Vertical gap between children, a token-scale step. */
  readonly gap?: SpacingStep;
  /** Cross-axis (horizontal) alignment of children. */
  readonly align?: StackAlign;
  /** Padding on all sides, a token-scale step. */
  readonly padding?: SpacingStep;
  readonly className?: string;
}

/** A vertical layout primitive: absorbs the flex-column-with-gap shape every tier reinvented inline. */
export function Stack({
  children,
  gap = '0',
  align,
  padding,
  className = '',
}: StackProps): React.JSX.Element {
  return (
    <div
      className={`cl-stack ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spaceVar(gap),
        ...(align ? { alignItems: ALIGN_ITEMS[align] } : {}),
        ...(padding ? { padding: spaceVar(padding) } : {}),
      }}
    >
      {children}
    </div>
  );
}
