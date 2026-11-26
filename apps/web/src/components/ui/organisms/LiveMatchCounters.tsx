import { useEffect, useState } from 'react';
import type { SupportedLanguage } from '@copalibre/domain';
import { MatchCounters, type MatchPenaltyView } from '../molecules/MatchCounters.js';
import type { LiveMatchCounter } from '../../../lib/live-state.js';
import { matchCounterView, type MatchCounterTexts } from '../../../lib/match-counters.js';
import {
  getLiveScoreboardPatch,
  subscribeLiveScoreboardEvents,
  subscribeLiveScoreboardMatch,
} from '../../../lib/live-scoreboard-store.js';
import {
  subscribePublicMatchCounters,
  type PublicMatchCountersSnapshot,
} from '../../../lib/public-match-counters.js';

/**
 * A match's counters and active penalties on its public page. It starts from the server-rendered values
 * and takes each new projection while the match is live. The match's state comes from the live store, so
 * when the store records the end of the match (its state or a `match.finalized` event), the segment
 * counters and the penalties leave, and the subscription stops. The server's `live` prop is only the
 * starting view for a match the store has not seen.
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
  const [storeState, setStoreState] = useState(() => getLiveScoreboardPatch(matchId)?.state);
  const [ended, setEnded] = useState(false);

  useEffect(
    () =>
      subscribeLiveScoreboardMatch(matchId, () =>
        setStoreState(getLiveScoreboardPatch(matchId)?.state),
      ),
    [matchId],
  );
  useEffect(
    () =>
      subscribeLiveScoreboardEvents(matchId, (event) => {
        if (event.eventType === 'match.finalized') setEnded(true);
      }),
    [matchId],
  );

  const isLive = !ended && (storeState === undefined ? live : storeState === 'live');

  useEffect(() => {
    if (!isLive) return undefined;
    return subscribePublicMatchCounters(
      { matchId, organizationAlias, tournamentAlias },
      setSnapshot,
    );
  }, [isLive, matchId, organizationAlias, tournamentAlias]);

  const shownCounters = isLive
    ? snapshot.counters
    : snapshot.counters.filter((counter) => counter.scope === 'match');
  const views = matchCounterView(shownCounters, sides, language, texts);
  const penalties: readonly MatchPenaltyView[] = isLive
    ? snapshot.activePenalties.map((penalty) => ({
        ...penalty,
        sideName:
          sides.find((side) => side.entrantId === penalty.entrantId)?.name ?? penalty.entrantId,
      }))
    : [];
  return (
    <MatchCounters
      penalties={penalties}
      penaltyTemplate={penaltyTemplate}
      sides={sides}
      views={views}
    />
  );
}
