import type { TvWinnerZone } from '../../tv-types.js';
import { EntrantName } from '../../../ui/atoms/EntrantName.js';
import { EntrantEmblem } from '../../../ui/molecules/EntrantEmblem.js';

/**
 * The recap of a finished tournament that was decided zone by zone: one block per zone of the last
 * stage, headed by the zone's name, listing the club or clubs that won it. A shared title lists
 * every co-champion.
 */
export function TvChampions({
  zones,
}: {
  readonly zones: readonly TvWinnerZone[];
}): React.JSX.Element {
  return (
    <div className="tv-champions" data-testid="tv-champions-panel">
      {zones.map((zone, index) => (
        <section
          aria-label={zone.zoneName}
          className="tv-champions__zone cl-chamfer"
          data-testid="tv-champions-zone"
          key={zone.zoneName ?? index}
        >
          {zone.zoneName ? <h3 className="tv-champions__zone-name">{zone.zoneName}</h3> : null}
          <ul className="tv-champions__list">
            {zone.champions.map((champion) => (
              <li className="tv-champions__champion" key={champion.name}>
                <EntrantEmblem
                  alt=""
                  className="tv-champions__emblem"
                  abbreviation={champion.abbreviation}
                  decorative
                  size="clamp(9vmin, 10vmin, 11vmin)"
                  src={champion.emblemUrl}
                />
                <EntrantName
                  abbreviation={champion.abbreviation}
                  className="tv-champions__name"
                  fullName={champion.name}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
