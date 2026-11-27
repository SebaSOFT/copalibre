import { tvStatusToneClass, type TvStatusTone } from './tv-status-tone.js';

/** The tournament or match status on a TV surface: a dot, then its label, in the status tone. */
export function TvStatusBadge({
  tone,
  label,
  className,
}: {
  readonly tone: TvStatusTone;
  readonly label: string;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`tv-scorebug__badge ${tvStatusToneClass(tone)} cl-chamfer${className === undefined ? '' : ` ${className}`}`}
    >
      <span className={`tv-scorebug__dot${tone === 'live' ? ' cl-live-dot' : ''}`} />
      <span>{label}</span>
    </div>
  );
}
