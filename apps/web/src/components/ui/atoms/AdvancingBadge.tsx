import { Badge } from './Badge.js';
import { Icon } from './icon.js';

export interface AdvancingBadgeProps {
  readonly label: string;
  readonly className?: string;
}

/**
 * Marks the advancing side of a finalized drawn knockout match with both an icon
 * and localized text, never colour alone.
 */
export function AdvancingBadge({ label, className = '' }: AdvancingBadgeProps): React.JSX.Element {
  return (
    <Badge className={`cl-badge--positive cl-advancing-badge ${className}`.trim()}>
      <Icon name="winner" size={16} />
      <span>{label}</span>
    </Badge>
  );
}
