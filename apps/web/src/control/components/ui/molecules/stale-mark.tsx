import { Icon } from '../atoms/icon.js';

export interface StaleMarkProps {
  readonly label: string;
  readonly age: string;
  readonly className?: string;
}

/** Keeps visible that rendered data is older than its last successful read. */
export function StaleMark({ label, age, className = '' }: StaleMarkProps): React.JSX.Element {
  return (
    <span className={`cl-stale-mark ${className}`.trim()} role="status">
      <Icon name="clock" />
      <span>{label}</span>
      <span aria-hidden="true">·</span>
      <time>{age}</time>
    </span>
  );
}
