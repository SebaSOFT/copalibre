import { resolveLabel, type LocalizedLabel, type SupportedLanguage } from '@copalibre/domain';
import type { LiveMatch, LiveSegment } from './live-state.js';
import { segmentOrdinalLabel } from './segment-ordinal.js';
import {
  seriesScore,
  seriesSegments,
  toSeriesInput,
  type PublicSeriesState,
  type SegmentState,
} from './series.js';

/** One set of a match played in sets: the label, who is ahead in it and whether it is the live one. */
export interface TvSetChip {
  readonly number: number;
  readonly label: string;
  /** Home first; absent while the entrants are not both known. */
  readonly scores?: readonly [number, number];
  readonly current: boolean;
}

export interface TvSeriesProgress {
  readonly home: number;
  readonly away: number;
  /** The game in play or, with none in play, the next to be played; absent once the series is over. */
  readonly game?: number;
  readonly span: number;
  readonly pips: readonly SegmentState[];
}

export interface TvMatchProgress {
  readonly series?: TvSeriesProgress;
  /** The sets already played and the one being played, in order; empty for a match not played in sets. */
  readonly sets: readonly TvSetChip[];
  /** The segment being played, named by its place in the match: "2nd Half", "3rd Set", "2nd Lap". */
  readonly segmentLabel?: string;
}

const labelOf = (segment: LiveSegment, language: SupportedLanguage): string =>
  segment.label === undefined
    ? segment.type
    : resolveLabel(segment.label as string | LocalizedLabel, language);

/**
 * The segment in play by its place among those of its own type ("2nd Half"). A type the match plays
 * once is named without a number: "Overtime" is not "1st Overtime".
 */
function segmentNameOf(
  active: LiveSegment,
  segments: readonly LiveSegment[],
  language: SupportedLanguage,
): string {
  const label = labelOf(active, language);
  const ofType = segments.filter((segment) => segment.type === active.type);
  return ofType.length < 2
    ? label
    : segmentOrdinalLabel(label, ofType.indexOf(active) + 1, language);
}

/**
 * What a broadcast shows beside the score besides the score: where a series stands and which sets
 * have been played. Both are read from the projection and nothing is made up: a match with no series
 * and no untimed segments yields neither, and renders as it always did.
 */
export function tvMatchProgress(
  match: Pick<LiveMatch, 'segments' | 'state'> | undefined,
  series: PublicSeriesState | undefined,
  language: SupportedLanguage,
): TvMatchProgress {
  const segments = match?.segments ?? [];
  const sets = segments
    .filter((segment) => segment.timed === false && segment.state !== 'pending')
    .map((segment): TvSetChip => {
      const [home, away] = segment.scores ?? [];
      return {
        number: segment.number,
        label: labelOf(segment, language),
        ...(home === undefined || away === undefined ? {} : { scores: [home, away] as const }),
        current: segment.state === 'active',
      };
    });
  const active = segments.find((segment) => segment.state === 'active');
  const segmentLabel = active === undefined ? undefined : segmentNameOf(active, segments, language);

  if (series === undefined) {
    return { sets, ...(segmentLabel === undefined ? {} : { segmentLabel }) };
  }
  const input = toSeriesInput(series);
  const pips = seriesSegments(input);
  const score = seriesScore(input);
  const index = pips.findIndex((pip) => pip === 'current' || pip === 'upcoming');
  return {
    series: {
      home: score.home,
      away: score.away,
      ...(index === -1 ? {} : { game: index + 1 }),
      span: series.span,
      pips,
    },
    sets,
    ...(segmentLabel === undefined ? {} : { segmentLabel }),
  };
}
