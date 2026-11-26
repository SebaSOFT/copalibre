import { useEffect, useState } from 'react';
import type { SupportedLanguage } from '@copalibre/domain';
import { MatchCounters, type MatchPenaltyView } from '../molecules/MatchCounters.js';
import type { LiveMatchCounter } from '../../../lib/live-state.js';
import { matchCounterView, type MatchCounterTexts } from '../../../lib/match-counters.js';
import {
  subscribePublicMatchCounters,
  type PublicMatchCountersSnapshot,
} from '../../../lib/public-match-counters.js';

/**
 * A match's counters on its public page, kept current while the match is live. It starts from the
 * server-rendered values and takes each new tally the projection reports. Penalties show only while
 * the match is live.
 */
export function LiveMatchCounters({
  matchId,
  organizationAlias,
  tournamentAlias,
  initialCounters,
  initialPenalties,
  sides,
  language,
  texts,
  penaltyTemplate,
  live,
}: {
  readonly matchId: string;
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly initialCounters: readonly LiveMatchCounter[];
  readonly initialPenalties: PublicMatchCountersSnapshot['activePenalties'];
  readonly sides: readonly { readonly entrantId: string; readonly name: string }[];
  readonly language: SupportedLanguage;
  readonly texts: MatchCounterTexts;
  readonly penaltyTemplate: string;
  readonly live: boolean;
}): React.JSX.Element | null {
  const [snapshot, setSnapshot] = useState<PublicMatchCountersSnapshot>({
    counters: initialCounters,
    activePenalties: initialPenalties,
  });

  useEffect(() => {
    if (!live) return undefined;
    return subscribePublicMatchCounters(
      { matchId, organizationAlias, tournamentAlias, counters: initialCounters },
      setSnapshot,
    );
  }, [live, matchId, organizationAlias, tournamentAlias, initialCounters]);

  const views = matchCounterView(snapshot.counters, sides, language, texts);
  const penalties: readonly MatchPenaltyView[] = live
    ? snapshot.activePenalties.map((penalty) => ({
        ...penalty,
        sideName:
          sides.find((side) => side.entrantId === penalty.entrantId)?.name ?? penalty.entrantId,
      }))
    : [];
  return <MatchCounters penalties={penalties} penaltyTemplate={penaltyTemplate} views={views} />;
}
