import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import { resolveLabel, type SupportedLanguage } from '@copalibre/domain';
import type { OverviewMatch, StandingsRowView } from './overview.js';
import type { LiveMatch } from './live-state.js';

/**
 * Every phrase these derivations put on screen, resolved by the caller.
 *
 * They used to be Spanish literals sitting in this file — invisible to the
 * catalogue-coverage gate, which reads `.tsx` and `.astro` only. Taking them as
 * a parameter keeps the derivations pure and testable while making the text the
 * caller's to translate, which is the one place that knows the language.
 */
export interface TvStatisticsLabels {
  readonly homeSide: string;
  readonly awaySide: string;
  readonly points: string;
  readonly pointsShort: string;
  /** Stands in for a competitor the projection could not name; `{reference}`. */
  readonly unnamedActor: string;
  readonly scheduledMatches: string;
  readonly status: string;
  readonly inProgress: string;
  readonly matchesPlayed: string;
  readonly totalScored: string;
  readonly averagePerMatch: string;
  readonly highestResult: string;
  readonly championTitle: string;
  readonly tableLeaderTitle: string;
  /** "1st · {points} pts · {played} played". */
  readonly standingsRecord: string;
  /** "Grand final winner ({winner} – {loser})". */
  readonly grandFinalRecord: string;
}

/**
 * Fills a label's `{placeholders}`.
 *
 * Every field above is a plain string rather than a function for one hard
 * reason: these labels cross into a `client:load` island, and Astro serializes
 * an island's props as JSON. A function prop does not survive that — the island
 * simply fails to render, with no type error to warn anyone, which is exactly
 * how the broadcast scorebug once vanished from the TV surface.
 */
function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

export interface TopPerformer {
  readonly rank: number;
  readonly name: string;
  readonly clubName?: string;
  readonly clubEmblemObjectId?: string;
  readonly statLabel: string;
  readonly statValue: string | number;
}

export interface TournamentFact {
  readonly label: string;
  readonly value: string | number;
  readonly detail?: string;
}

export interface ChampionInfo {
  readonly name: string;
  readonly abbreviation?: string;
  readonly emblemObjectId?: string;
  readonly title: string;
  readonly record?: string;
}

function extractScores(match: LiveMatch | OverviewMatch, labels: TvStatisticsLabels) {
  if ('sides' in match) {
    const [s0, s1] = match.sides;
    return {
      s1: s0?.score ?? 0,
      s2: s1?.score ?? 0,
      hName: s0?.name ?? labels.homeSide,
      aName: s1?.name ?? labels.awaySide,
      hAbbr: s0?.abbreviation,
      aAbbr: s1?.abbreviation,
    };
  }
  return {
    s1: match.home.score ?? 0,
    s2: match.away.score ?? 0,
    hName: match.home.name,
    aName: match.away.name,
    hAbbr: match.home.abbreviation,
    aAbbr: match.away.abbreviation,
  };
}

/**
 * Derives top performers from a table projection (e.g. top-scorers or player-rankings).
 * Falls back to computing top teams from standings or match occurrences if no player table is provided.
 */
export function primaryColumn(
  projection: TableProjectionResponse,
): TableProjectionResponse['columns'][number] | undefined {
  const ranked = projection.defaultSort?.[0]?.columnCode;
  const declared = ranked ? projection.columns.find((column) => column.code === ranked) : undefined;
  return declared ?? projection.columns[projection.columns.length - 1];
}

export function deriveTopPerformers(
  labels: TvStatisticsLabels,
  language: SupportedLanguage,
  tableProjection?: TableProjectionResponse,
  standings?: readonly StandingsRowView[],
  clubs?: readonly { name: string; emblemObjectId?: string }[],
): readonly TopPerformer[] {
  if (tableProjection && tableProjection.rows.length > 0) {
    const column = primaryColumn(tableProjection);
    const primaryCol =
      column?.code ?? Object.keys(tableProjection.rows[0]?.cells ?? {})[0] ?? 'score';
    // A discipline declares its headers as a `LocalizedLabel`; discarding one
    // that is not already a string threw away the very translation it carries.
    const statHeader = column ? resolveLabel(column.header, language) : labels.points;

    return tableProjection.rows.slice(0, 5).map((row) => {
      const cell = row.cells[primaryCol];
      const entrantName =
        row.entrantName || fill(labels.unnamedActor, { reference: row.actorId.substring(0, 6) });
      const clubMatch = clubs?.find((c) => c.name.toLowerCase() === entrantName.toLowerCase());
      const rawVal = cell?.formatted || (cell?.raw !== undefined ? String(cell.raw) : '0');
      return {
        rank: row.rank,
        name: entrantName,
        clubName: row.entrantName,
        clubEmblemObjectId: clubMatch?.emblemObjectId,
        statLabel: statHeader,
        statValue: rawVal,
      };
    });
  }

  if (standings && standings.length > 0) {
    return standings.slice(0, 3).map((s) => {
      const clubMatch = clubs?.find((c) => c.name.toLowerCase() === s.name.toLowerCase());
      return {
        rank: s.position,
        name: s.name,
        clubName: s.name,
        clubEmblemObjectId: clubMatch?.emblemObjectId,
        statLabel: labels.pointsShort,
        statValue: s.points,
      };
    });
  }

  return [];
}

/**
 * Derives high-level tournament recap facts from played matches.
 */
export function deriveTournamentFacts(
  labels: TvStatisticsLabels,
  matches: readonly (LiveMatch | OverviewMatch)[],
): readonly TournamentFact[] {
  const finalMatches = matches.filter((m) => m.state === 'final');
  if (finalMatches.length === 0) {
    return [
      { label: labels.scheduledMatches, value: matches.length },
      { label: labels.status, value: labels.inProgress },
    ];
  }

  let totalScore = 0;
  let highestMatchScore = -1;
  let highestMatchDetail = '';

  for (const match of finalMatches) {
    const { s1, s2, hName, aName } = extractScores(match, labels);
    const matchScore = s1 + s2;
    totalScore += matchScore;
    if (matchScore > highestMatchScore) {
      highestMatchScore = matchScore;
      highestMatchDetail = `${hName} ${s1} - ${s2} ${aName}`;
    }
  }

  const avg = (totalScore / finalMatches.length).toFixed(1);

  const facts: TournamentFact[] = [
    { label: labels.matchesPlayed, value: finalMatches.length },
    { label: labels.totalScored, value: totalScore },
    { label: labels.averagePerMatch, value: avg },
  ];

  if (highestMatchScore >= 0 && highestMatchDetail) {
    facts.push({
      // The figure alone, never "N goles": the unit belongs to the discipline,
      // and football's is not every discipline's.
      label: labels.highestResult,
      value: highestMatchScore,
      detail: highestMatchDetail,
    });
  }

  return facts;
}

/**
 * Resolves tournament champion if the tournament has concluded.
 * Checks final knockout match winner, or top position in standings.
 */
export function resolveChampion(
  labels: TvStatisticsLabels,
  matches: readonly (LiveMatch | OverviewMatch)[],
  standings?: readonly StandingsRowView[],
  clubs?: readonly { name: string; emblemObjectId?: string }[],
): ChampionInfo | undefined {
  if (matches.length === 0 && (!standings || standings.length === 0)) {
    return undefined;
  }

  const allFinal = matches.length > 0 && matches.every((m) => m.state === 'final');

  // Check 1: Standings rank 1 if all matches are final
  if (allFinal && standings && standings.length > 0) {
    const leader = standings.find((s) => s.position === 1) ?? standings[0];
    if (leader) {
      const clubMatch = clubs?.find((c) => c.name.toLowerCase() === leader.name.toLowerCase());
      return {
        name: leader.name,
        abbreviation: leader.abbreviation,
        emblemObjectId: clubMatch?.emblemObjectId,
        title: labels.championTitle,
        record: fill(labels.standingsRecord, { points: leader.points, played: leader.played }),
      };
    }
  }

  // Check 2: Final match of tournament
  if (allFinal && matches.length > 0) {
    const sorted = [...matches].sort((a, b) => {
      const sA = a.stageNumber ?? 0;
      const sB = b.stageNumber ?? 0;
      if (sA !== sB) return sB - sA;
      return (b.matchNumber ?? 0) - (a.matchNumber ?? 0);
    });

    const lastMatch = sorted[0];
    if (lastMatch) {
      const {
        s1: homeScore,
        s2: awayScore,
        hName: homeName,
        aName: awayName,
        hAbbr: homeAbbr,
        aAbbr: awayAbbr,
      } = extractScores(lastMatch, labels);

      if (homeScore > awayScore) {
        const clubMatch = clubs?.find((c) => c.name.toLowerCase() === homeName.toLowerCase());
        return {
          name: homeName,
          abbreviation: homeAbbr,
          emblemObjectId: clubMatch?.emblemObjectId,
          title: labels.championTitle,
          record: fill(labels.grandFinalRecord, { winner: homeScore, loser: awayScore }),
        };
      }
      if (awayScore > homeScore) {
        const clubMatch = clubs?.find((c) => c.name.toLowerCase() === awayName.toLowerCase());
        return {
          name: awayName,
          abbreviation: awayAbbr,
          emblemObjectId: clubMatch?.emblemObjectId,
          title: labels.championTitle,
          record: fill(labels.grandFinalRecord, { winner: awayScore, loser: homeScore }),
        };
      }
    }
  }

  // Check 3: If tournament not completely finished, leader in standings is current leader
  if (standings && standings.length > 0) {
    const leader = standings.find((s) => s.position === 1) ?? standings[0];
    if (leader) {
      const clubMatch = clubs?.find((c) => c.name.toLowerCase() === leader.name.toLowerCase());
      return {
        name: leader.name,
        abbreviation: leader.abbreviation,
        emblemObjectId: clubMatch?.emblemObjectId,
        title: labels.tableLeaderTitle,
        record: fill(labels.standingsRecord, { points: leader.points, played: leader.played }),
      };
    }
  }

  return undefined;
}
