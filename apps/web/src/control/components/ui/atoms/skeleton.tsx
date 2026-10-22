export type SkeletonVariant = 'block' | 'line' | 'table-row';

export interface SkeletonProps {
  readonly label: string;
  readonly variant: SkeletonVariant;
  readonly className?: string;
}

/** An opaque, layout-sized placeholder with no motion. */
export function Skeleton({ label, variant, className = '' }: SkeletonProps): React.JSX.Element {
  return (
    <div
      aria-busy="true"
      className={`cl-skeleton cl-skeleton--${variant} ${className}`.trim()}
      role="status"
    >
      <span className="cl-visually-hidden">{label}</span>
      <span aria-hidden="true" className="cl-skeleton__shape" />
    </div>
  );
}
