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
  anchor = false,
}: {
  readonly name: string;
  readonly abbreviation?: string;
  readonly clubId?: string;
  readonly clubs?: readonly TvClubItem[];
  /** The home side, on the spotlight's left — the jumbotron's visual anchor. */
  readonly anchor?: boolean;
}): React.JSX.Element {
  const club = clubId === undefined ? undefined : clubs?.find((c) => c.clubId === clubId);

  return (
    <div className={`tv-team-side ${anchor ? 'tv-team-side--anchor' : ''}`.trim()}>
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
      {/* A narrow frame shows the abbreviation instead (the stylesheet swaps them); the name stays the tooltip. */}
      <EntrantName
        abbreviation={abbreviation}
        className={
          abbreviation === undefined
            ? 'tv-team-side__name'
            : 'tv-team-side__name tv-team-side__full'
        }
        fullName={name}
      />
      {abbreviation !== undefined && (
        <abbr className="tv-team-side__name tv-team-side__short" title={name}>
          {abbreviation}
        </abbr>
      )}
    </div>
  );
}
