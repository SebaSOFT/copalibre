import type { PublicBracketResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import type { ResultReason } from '@copalibre/domain';
import type { BracketMatch, SlotSource } from './bracket.js';
import type { MatchState } from './overview.js';
import type { PublicSeriesState } from './series.js';

/** One zone's own bracket, mapped from the wire shape. Safe in server and browser bundles. */
export interface BracketZone {
  readonly zoneId?: string;
  readonly zoneName?: string;
  readonly matches: readonly BracketMatch[];
}

function mapBracketZoneMatches(
  matches: PublicBracketResponse['zones'][number]['matches'],
): readonly BracketMatch[] {
  // Sources are scoped to one zone; positions from another zone can collide.
  const sourcePositions = new Map(matches.map((match) => [match.matchId, match.position]));
  const sourceNumber = (matchId?: string): number | undefined => {
    if (matchId === undefined) return undefined;
    const position = sourcePositions.get(matchId);
    if (position !== undefined) return position;
    return /^\d+$/.test(matchId) ? Number(matchId) : undefined;
  };
  return matches.map((m) => ({
    matchId: m.matchId,
    matchNumber: m.matchNumber ?? m.position,
    roundNumber: m.round,
    branch: m.bracket,
    state: (m.status === 'finalized' || m.status === 'forfeited'
      ? 'final'
      : m.status === 'scheduled'
        ? 'upcoming'
        : m.status) as MatchState,
    scores: m.slots.map((s) => s.score),
    resultReasons: m.slots.map((s) => s.resultReason as ResultReason | undefined),
    slots: m.slots.map((s): SlotSource => {
      if (s.kind === 'winner-of' || s.kind === 'loser-of') {
        const matchNumber = sourceNumber(s.matchId);
        return {
          kind: s.kind,
          matchId: s.matchId,
          ...(matchNumber === undefined ? {} : { matchNumber }),
        };
      }
      return {
        kind: 'entrant',
        entrantId: s.entrantId,
        name: s.name ?? 'TBD',
        abbreviation: s.abbreviation,
        clubId: s.clubId,
        emblemObjectId: s.emblemObjectId,
      };
    }),
    ...(m.series === undefined ? {} : { series: m.series as PublicSeriesState }),
  }));
}

export function mapBracketResponse(response: PublicBracketResponse): {
  format?: string;
  zones: readonly BracketZone[];
} {
  return {
    format: response.format,
    zones: response.zones.map((zone) => ({
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      matches: mapBracketZoneMatches(zone.matches),
    })),
  };
}
