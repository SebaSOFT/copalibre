import { EntrantName } from '../ui/atoms/EntrantName.js';
import type { TvClubItem } from './tv-types.js';

/**
 * Extracted from `TvDashboard.tsx` (openspec 0225 task 7.1) — one side of the
 * spotlight match, matched against the roster's club emblem by name.
 */
export function TvTeamSide({
  name,
  abbreviation,
  clubs,
  anchor = false,
}: {
  readonly name: string;
  readonly abbreviation?: string;
  readonly clubs?: readonly TvClubItem[];
  /** The home side, on the spotlight's left — the jumbotron's visual anchor (openspec 0247). */
  readonly anchor?: boolean;
}): React.JSX.Element {
  const club = clubs?.find((c) => c.name.toLowerCase() === name.toLowerCase());

  return (
    <div className={`tv-team-side ${anchor ? 'tv-team-side--anchor' : ''}`.trim()}>
      <div className="tv-team-side__emblem-wrap">
        {club?.emblemObjectId ? (
          <img
            alt={name}
            className="tv-team-side__emblem"
            src={`/api/objects/${club.emblemObjectId}`}
          />
        ) : (
          <div className="tv-team-side__monogram">
            {abbreviation ?? name.substring(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <EntrantName abbreviation={abbreviation} className="tv-team-side__name" fullName={name} />
    </div>
  );
}
