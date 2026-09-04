import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import type { OverviewMatch, StandingsRowView } from './overview.js';
import type { LiveMatch } from './live-state.js';

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

function extractScores(match: LiveMatch | OverviewMatch) {
  if ('sides' in match) {
    const [s0, s1] = match.sides;
    return {
      s1: s0?.score ?? 0,
      s2: s1?.score ?? 0,
      hName: s0?.name ?? 'Local',
      aName: s1?.name ?? 'Visitante',
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
export function deriveTopPerformers(
  tableProjection?: TableProjectionResponse,
  standings?: readonly StandingsRowView[],
  clubs?: readonly { name: string; emblemObjectId?: string }[],
): readonly TopPerformer[] {
  if (tableProjection && tableProjection.rows.length > 0) {
    const firstCol = tableProjection.columns[0];
    const primaryCol =
      firstCol?.code ?? Object.keys(tableProjection.rows[0]?.cells ?? {})[0] ?? 'score';
    const statHeader = typeof firstCol?.header === 'string' ? firstCol.header : 'Puntos';

    return tableProjection.rows.slice(0, 5).map((row) => {
      const cell = row.cells[primaryCol];
      const entrantName = row.entrantName || `Jugador ${row.actorId.substring(0, 6)}`;
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
        statLabel: 'Pts',
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
  matches: readonly (LiveMatch | OverviewMatch)[],
): readonly TournamentFact[] {
  const finalMatches = matches.filter((m) => m.state === 'final');
  if (finalMatches.length === 0) {
    return [
      { label: 'Partidos en agenda', value: matches.length },
      { label: 'Estado', value: 'En desarrollo' },
    ];
  }

  let totalScore = 0;
  let highestMatchScore = -1;
  let highestMatchDetail = '';

  for (const match of finalMatches) {
    const { s1, s2, hName, aName } = extractScores(match);
    const matchScore = s1 + s2;
    totalScore += matchScore;
    if (matchScore > highestMatchScore) {
      highestMatchScore = matchScore;
      highestMatchDetail = `${hName} ${s1} - ${s2} ${aName}`;
    }
  }

  const avg = (totalScore / finalMatches.length).toFixed(1);

  const facts: TournamentFact[] = [
    { label: 'Partidos disputados', value: finalMatches.length },
    { label: 'Total anotaciones', value: totalScore },
    { label: 'Promedio por partido', value: avg },
  ];

  if (highestMatchScore >= 0 && highestMatchDetail) {
    facts.push({
      label: 'Mayor resultado',
      value: `${highestMatchScore} goles`,
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
        title: 'CAMPEÓN DEL TORNEO',
        record: `1º PUESTO · ${leader.points} PUNTOS · ${leader.played} PJ`,
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
      } = extractScores(lastMatch);

      if (homeScore > awayScore) {
        const clubMatch = clubs?.find((c) => c.name.toLowerCase() === homeName.toLowerCase());
        return {
          name: homeName,
          abbreviation: homeAbbr,
          emblemObjectId: clubMatch?.emblemObjectId,
          title: 'CAMPEÓN DEL TORNEO',
          record: `GANADOR DE LA GRAN FINAL (${homeScore} - ${awayScore})`,
        };
      }
      if (awayScore > homeScore) {
        const clubMatch = clubs?.find((c) => c.name.toLowerCase() === awayName.toLowerCase());
        return {
          name: awayName,
          abbreviation: awayAbbr,
          emblemObjectId: clubMatch?.emblemObjectId,
          title: 'CAMPEÓN DEL TORNEO',
          record: `GANADOR DE LA GRAN FINAL (${awayScore} - ${homeScore})`,
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
        title: 'LÍDER DE LA TABLA',
        record: `1º PUESTO · ${leader.points} PUNTOS · ${leader.played} PJ`,
      };
    }
  }

  return undefined;
}
