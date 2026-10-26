import { EntrantName } from '../ui/atoms/EntrantName.js';
import { EntrantEmblem } from '../ui/molecules/EntrantEmblem.js';
import type { TvClubItem } from './tv-types.js';

/**
 * Extracted from `TvDashboard.tsx` — one side of the spotlight match.
 */
export function TvTeamSide({
  name,
  abbreviation,
  clubId,
  clubs,
  roleLabel,
  leading = false,
  leadingLabel,
}: {
  readonly name: string;
  readonly abbreviation?: string;
  readonly clubId?: string;
  readonly clubs?: readonly TvClubItem[];
  readonly roleLabel: string;
  readonly leading?: boolean;
  readonly leadingLabel?: string;
}): React.JSX.Element {
  const club = clubId === undefined ? undefined : clubs?.find((c) => c.clubId === clubId);

  return (
    <div className="tv-team-side" data-leading={leading || undefined}>
      <div className="tv-team-side__emblem-wrap">
        <EntrantEmblem
          alt={name}
          className="tv-team-side__emblem"
          abbreviation={abbreviation}
          decorative
          size="100%"
          src={club?.emblemUrl}
        />
      </div>
      {/* The full name remains visible; the monogram belongs to the emblem tile. */}
      <EntrantName className="tv-team-side__name" fullName={name} />
      {leadingLabel && (
        <span
          aria-hidden={!leading || undefined}
          className={`tv-team-side__leading${leading ? '' : ' tv-team-side__leading--placeholder'}`}
        >
          {leading ? leadingLabel : '\u00a0'}
        </span>
      )}
      <span className="tv-team-side__role cl-chamfer">{roleLabel}</span>
    </div>
  );
}
