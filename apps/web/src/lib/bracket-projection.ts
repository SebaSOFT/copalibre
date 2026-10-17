import { finalRoundOf } from './side-source.js';
import type { PublicBracketResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import type { ResultReason } from '@copalibre/domain';
import type { BracketMatch, SlotSource } from './bracket.js';
import type { MatchState } from './overview.js';
import type { PublicSeriesState } from './series.js';

/** One zone's own bracket, mapped from the wire shape. Safe in server and browser bundles. */
export interface BracketZone {
  readonly zoneId?: string;
  readonly zoneName?: string;
  /** The format this zone plays (its own, else its stage's); decides how it is drawn. */
  readonly format?: string;
  readonly matches: readonly BracketMatch[];
}

function mapBracketZoneMatches(
  matches: PublicBracketResponse['zones'][number]['matches'],
): readonly BracketMatch[] {
  const finalRound = finalRoundOf(matches);
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
    nodeKey: m.nodeKey,
    sourceFinalRound: finalRound,
    matchNumber: m.matchNumber ?? m.position,
    roundNumber: m.round,
    position: m.position,
    ...(m.role === undefined ? {} : { role: m.role }),
    branch: m.bracket,
    state: (m.status === 'finalized' || m.status === 'forfeited'
      ? 'final'
      : m.status === 'scheduled'
        ? 'upcoming'
        : m.status) as MatchState,
    scores: m.slots.map((s) => s.score),
    resultReasons: m.slots.map((s) => s.resultReason as ResultReason | undefined),
    slots: m.slots.map((s, index): SlotSource => {
      if (s.kind === 'winner-of' || s.kind === 'loser-of') {
        const matchNumber = sourceNumber(s.matchId);
        const persisted = index === 0 ? m.homeSource : m.awaySource;
        // A persisted source names its feeder; a legacy slot borrows the feeder's own position.
        const source =
          persisted?.kind === 'winner-of' || persisted?.kind === 'loser-of'
            ? persisted
            : s.matchId === undefined
              ? undefined
              : matches.find((match) => match.matchId === s.matchId);
        return {
          ...(source?.nodeKey === undefined ? {} : { nodeKey: source.nodeKey }),
          ...(source?.round === undefined ? {} : { round: source.round }),
          ...(source?.position === undefined ? {} : { position: source.position }),
          kind: s.kind,
          matchId: s.matchId,
          ...(matchNumber === undefined ? {} : { matchNumber }),
        };
      }
      const persisted = index === 0 ? m.homeSource : m.awaySource;
      if (s.entrantId === undefined && persisted?.kind === 'qualifier') {
        return {
          kind: 'qualifier',
          promotionPlanId: persisted.promotionPlanId,
          position: persisted.position,
          ...(persisted.qualifierLabel === undefined
            ? {}
            : { qualifierLabel: persisted.qualifierLabel }),
        };
      }
      return {
        kind: 'entrant',
        entrantId: s.entrantId,
        name: s.name ?? 'TBD',
        abbreviation: s.abbreviation,
        clubId: s.clubId,
        emblemObjectId: s.emblemObjectId,
        ...(s.from === undefined
          ? {}
          : { from: { matchId: s.from.matchId, outcome: s.from.outcome } }),
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
      format: zone.format,
      matches: mapBracketZoneMatches(zone.matches),
    })),
  };
}
