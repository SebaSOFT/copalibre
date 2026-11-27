import { useEffect, useRef, useState } from 'react';
import { API_PATH_PREFIX } from '../../lib/api-path.ts';
import type { PublicBracketResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { mapBracketResponse } from '../../lib/bracket-projection.js';
import { bracketZonesOf } from '../../lib/bracket.js';
import type { BracketZone } from '../../lib/bracket-projection.js';

/**
 * The bracket of the spotlight's stage, refreshed on the poll interval (never faster than 15 seconds). A
 * failed refresh keeps the last bracket and marks it stale; a corner overlay draws no bracket at all.
 */
export function useTvBracket({
  initialBracket,
  organizationAlias,
  tournamentAlias,
  bracketStage,
  isCornerOverlay,
  pollIntervalMs,
  undecidedSide,
}: {
  readonly initialBracket:
    { readonly stageNumber: number; readonly zones: readonly BracketZone[] } | undefined;
  readonly organizationAlias: string | undefined;
  readonly tournamentAlias: string | undefined;
  readonly bracketStage: number | undefined;
  readonly isCornerOverlay: boolean;
  readonly pollIntervalMs: number;
  readonly undecidedSide: string;
}): {
  readonly bracketData:
    { readonly stageNumber: number; readonly zones: readonly BracketZone[] } | undefined;
  readonly bracketStale: boolean;
} {
  const [bracketData, setBracketData] = useState(initialBracket);
  const bracketDataRef = useRef(initialBracket);
  const [bracketStale, setBracketStale] = useState(false);
  useEffect(() => {
    if (isCornerOverlay || !organizationAlias || !tournamentAlias || !bracketStage) return;
    const refreshBracket = async () => {
      try {
        const response = await fetch(
          `${API_PATH_PREFIX}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/stages/${bracketStage}/bracket`,
        );
        if (!response.ok) {
          if (bracketDataRef.current) setBracketStale(true);
          return;
        }
        const mapped = mapBracketResponse(
          (await response.json()) as PublicBracketResponse,
          undecidedSide,
        );
        const zones = bracketZonesOf(mapped);
        const nextBracket = zones.length > 0 ? { stageNumber: bracketStage, zones } : undefined;
        bracketDataRef.current = nextBracket;
        setBracketData(nextBracket);
        setBracketStale(false);
      } catch {
        if (bracketDataRef.current) setBracketStale(true);
      }
    };
    void refreshBracket();
    const timer = window.setInterval(() => void refreshBracket(), Math.max(pollIntervalMs, 15_000));
    return () => window.clearInterval(timer);
  }, [
    organizationAlias,
    tournamentAlias,
    bracketStage,
    isCornerOverlay,
    pollIntervalMs,
    undecidedSide,
  ]);

  return { bracketData, bracketStale };
}
