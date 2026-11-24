import type { PublicPersonCompetitionHistoryResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import type { TableCellResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import { applyTemplate, type MatchCardData } from './matches-view.js';
import { formatSideSource, type SideSourceMessages } from './side-source.js';

export interface PlayerNextMatchCandidate {
  readonly match: MatchCardData;
  readonly side: 'home' | 'away';
}

function kickoffMs(match: MatchCardData): number | undefined {
  if (match.scheduledAt === undefined || match.scheduledAt === '') return undefined;
  const parsed = Date.parse(match.scheduledAt);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Selects the current tournament's competition-history entry for a person.
 * Returns `undefined` when the player has no entry for that tournament alias.
 */
export function currentTournamentHistoryEntry(
  history: readonly PublicPersonCompetitionHistoryResponse[],
  tournamentAlias?: string,
): PublicPersonCompetitionHistoryResponse | undefined {
  if (!tournamentAlias) return undefined;
  return history.find((entry) => entry.tournamentAlias === tournamentAlias);
}

/**
 * Selects the earliest `live` or `upcoming` match for the given entrant by
 * `scheduledAt` ascending (with unscheduled matches ordered after scheduled
 * ones, and stage/match ordinals breaking ties).
 */
export function findPlayerNextMatch(
  matches: readonly MatchCardData[],
  entrantId: string,
): PlayerNextMatchCandidate | undefined {
  const candidates = matches
    .filter(
      (match) =>
        (match.state === 'live' || match.state === 'upcoming') &&
        (match.homeEntrantId === entrantId || match.awayEntrantId === entrantId),
    )
    .sort((left, right) => {
      const leftTime = kickoffMs(left);
      const rightTime = kickoffMs(right);
      if (leftTime !== undefined && rightTime !== undefined && leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      if (leftTime !== rightTime) {
        return leftTime !== undefined ? -1 : 1;
      }
      if (left.state !== right.state) {
        return left.state === 'live' ? -1 : 1;
      }
      return left.stageNumber - right.stageNumber || left.matchNumber - right.matchNumber;
    });

  const first = candidates[0];
  if (!first) return undefined;
  return {
    match: first,
    side: first.homeEntrantId === entrantId ? 'home' : 'away',
  };
}

/**
 * Resolves the opponent display name for the player's next match, falling back
 * to the structural side-source label when the opponent is not yet decided.
 */
export function resolveNextMatchOpponent(
  match: MatchCardData,
  side: 'home' | 'away',
  sideSource: SideSourceMessages,
): string {
  const opponentName = side === 'home' ? match.awayName : match.homeName;
  if (opponentName && opponentName.trim().length > 0) {
    return opponentName;
  }
  const opponentSource = side === 'home' ? match.awaySource : match.homeSource;
  if (opponentSource) {
    return formatSideSource(opponentSource, sideSource).long;
  }
  return sideSource.unknown;
}

/**
 * Formats a player's match-by-match label (`{date} · {opponent} · {score}`),
 * omitting missing date or score segments cleanly without dangling separators.
 */
export function formatPlayerMatchRowLabel(params: {
  readonly date?: string;
  readonly opponent: string;
  readonly score?: string;
  readonly template: string;
}): string {
  const date = params.date?.trim() ?? '';
  const opponent = params.opponent.trim();
  const score = params.score?.trim() ?? '';
  if (date.length > 0 && score.length > 0) {
    return applyTemplate(params.template, { date, opponent, score });
  }
  return [date, opponent, score].filter((part) => part.length > 0).join(' · ');
}

/**
 * Formats a player-statistics cell for the profile tables and quick-view dialog.
 * Preserves any non-empty server-formatted value and replaces empty/missing cells
 * with the column's declared `zeroDisplay`, "0" for numeric counts, or "—" for
 * ratios, fractions, and percentages so applicable discipline columns never render
 * as blank voids.
 */
export function formatPlayerStatCell(
  cell: TableCellResponse | undefined,
  column: { readonly format: string; readonly zeroDisplay?: string },
): string {
  if (cell?.formatted !== undefined && cell.formatted !== '') return cell.formatted;
  if (column.zeroDisplay !== undefined && column.zeroDisplay !== '') return column.zeroDisplay;
  return column.format === 'number' ? '0' : '—';
}
