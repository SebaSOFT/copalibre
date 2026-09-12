import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import { resolveLabel, type SupportedLanguage } from '@copalibre/domain';
import type { OverviewMatch } from './overview.js';
import { primaryColumn } from './tv-statistics.js';

/**
 * The ticker's item model.
 *
 * One shape for every kind, because the reference component's anatomy — badge,
 * subject, chipped figure, parenthesised meta — reads the same whether the
 * subject is a fixture, a scorer, or a group leader. A second look for each new
 * kind would be a second thing to keep in step.
 */
export interface TickerItem {
  readonly key: string;
  readonly kind: 'match' | 'performer' | 'leader';
  readonly badge: string;
  readonly tone: 'live' | 'upcoming' | 'positive';
  readonly subject: string;
  /** The second competitor; only a match has one. */
  readonly opponent?: string;
  /** The chipped figure — a score, a goal count, a points total. */
  readonly figure: string;
  /** Parenthesised trailing text: a clock, a kickoff time, a metric name. */
  readonly meta?: string;
  /**
   * The extra-period label, and only where the discipline configures one.
   *
   * A match running past its regulation time is not evidence that the format
   * has an overtime: a fixture that simply started late looks identical from
   * here. So nothing derives this — the caller supplies it from the descriptor
   * or the entry carries none, which is what keeps the label off every
   * discipline that declares no such period.
   */
  readonly overtime?: string;
}

export interface TickerLabels {
  readonly live: string;
  readonly upcoming: string;
  readonly final: string;
  readonly leader: string;
  /** Shown between two competitors who have not played yet. */
  readonly versus: string;
}

/**
 * Names the extra period a match is in, or nothing.
 *
 * The descriptor is the authority. A caller that has no overtime configured
 * supplies no resolver, and no entry can then carry the label — which is the
 * rule stated as a type rather than as a comment somebody has to remember.
 */
export type OvertimeResolver = (match: OverviewMatch) => string | undefined;

/** A live or finished fixture reads as a score; one not yet played reads as `VS`. */
function matchItem(
  match: OverviewMatch,
  index: number,
  labels: TickerLabels,
  overtimeFor?: OvertimeResolver,
): TickerItem {
  const played = match.home.score !== undefined && match.away.score !== undefined;
  const overtime = overtimeFor?.(match);
  const tone =
    match.state === 'live' ? 'live' : match.state === 'upcoming' ? 'upcoming' : 'positive';
  return {
    key: `match-${match.stageNumber}-${match.matchNumber ?? index}`,
    kind: 'match',
    badge:
      match.state === 'live'
        ? labels.live
        : match.state === 'upcoming'
          ? labels.upcoming
          : labels.final,
    tone,
    subject: match.home.name,
    opponent: match.away.name,
    figure: played ? `${match.home.score} : ${match.away.score}` : labels.versus,
    ...(match.startsAt === '' ? {} : { meta: match.startsAt }),
    ...(overtime === undefined ? {} : { overtime }),
  };
}

/**
 * Builds the rail's items.
 *
 * Every kind is omitted rather than emptied when the tournament has nothing to
 * say with it: a discipline that declares no player ranking contributes no
 * performer items, exactly as a stage with no groups contributes one leader
 * instead of several. The caller passes what it managed to fetch; nothing here
 * fetches anything.
 */
export function buildTickerItems(input: {
  readonly matches: readonly OverviewMatch[];
  readonly performers?: TableProjectionResponse;
  readonly leaders?: TableProjectionResponse;
  readonly labels: TickerLabels;
  readonly language: SupportedLanguage;
  /** Supplied only by a surface whose discipline declares an extra period. */
  readonly overtimeFor?: OvertimeResolver;
}): readonly TickerItem[] {
  const { matches, performers, leaders, labels, language, overtimeFor } = input;
  const items: TickerItem[] = matches.map((match, index) =>
    matchItem(match, index, labels, overtimeFor),
  );

  if (performers && performers.rows.length > 0) {
    const column = primaryColumn(performers);
    const metric = column ? resolveLabel(column.header, language) : undefined;
    for (const row of performers.rows.slice(0, 5)) {
      const cell = column ? row.cells[column.code] : undefined;
      items.push({
        key: `performer-${row.actorId}`,
        kind: 'performer',
        badge: resolveLabel(performers.label, language),
        tone: 'positive',
        subject: row.entrantName ?? `#${row.rank}`,
        figure: cell?.formatted ?? String(cell?.raw ?? '0'),
        ...(metric === undefined ? {} : { meta: metric }),
      });
    }
  }

  // One leader per segment. A stage with groups yields one per group; a stage
  // without them yields exactly one, because `computeStandings` ranks an
  // elimination bracket's entrants from their outcomes just as it ranks a
  // league's — so no format is left with an empty item kind.
  for (const segment of leaders?.segments ?? []) {
    const top = segment.rows[0];
    if (!top) continue;
    const column = leaders ? primaryColumn(leaders) : undefined;
    const cell = column ? top.cells[column.code] : undefined;
    items.push({
      key: `leader-${segment.groupId ?? 'stage'}`,
      kind: 'leader',
      badge: segment.groupName ?? labels.leader,
      tone: 'positive',
      subject: top.entrantName ?? `#${top.rank}`,
      figure: cell?.formatted ?? String(cell?.raw ?? '0'),
      ...(column === undefined ? {} : { meta: resolveLabel(column.header, language) }),
    });
  }

  return items;
}
