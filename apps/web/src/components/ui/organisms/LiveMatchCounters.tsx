import { useEffect, useRef, useState } from 'react';
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
  watchPublicMatchCounters,
  type PublicMatchCountersSnapshot,
  type PublicMatchCountersWatch,
} from '../../../lib/public-match-counters.js';

/**
 * A match's counters and active penalties on its public page, for a match that tracks its live indicators.
 *
 * The page follows the stream from before the match starts. Its phase comes from the stream: a
 * `match.started` event, or the store's state, makes it live, and turns on the 15 s reconcile; a
 * `match.finalized` event, or the store's final state, ends it, once the final match-scope counters are
 * taken from the report and the segment counters and penalties leave. A page rendered after the match has
 * ended takes no part in the stream.
 */
export function LiveMatchCounters({
  matchId,
  organizationAlias,
  tournamentAlias,
  stageNumber,
  matchOrdinal,
  finished,
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
  readonly stageNumber: number;
  readonly matchOrdinal: number;
  /** The server rendered the match as over: the page takes no part in the stream. */
  readonly finished: boolean;
  readonly initialCounters: readonly LiveMatchCounter[];
  readonly initialPenalties: PublicMatchCountersSnapshot['activePenalties'];
  readonly sides: readonly {
    readonly entrantId: string;
    readonly name: string;
    readonly place: 'home' | 'away';
  }[];
  readonly language: SupportedLanguage;
  readonly texts: MatchCounterTexts;
  readonly penaltyTemplate: string;
  /** The server rendered the match as live. */
  readonly live: boolean;
}): React.JSX.Element | null {
  const [snapshot, setSnapshot] = useState<PublicMatchCountersSnapshot>({
    counters: initialCounters,
    activePenalties: initialPenalties,
  });
  const [storeState, setStoreState] = useState(() => getLiveScoreboardPatch(matchId)?.state);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(finished);
  const watch = useRef<PublicMatchCountersWatch | null>(null);

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
        if (event.eventType === 'match.started') setStarted(true);
        if (event.eventType === 'match.finalized') setEnded(true);
      }),
    [matchId],
  );

  const over = ended || storeState === 'final';
  const isLive = !over && (started || storeState === 'live' || (storeState === undefined && live));

  useEffect(() => {
    if (finished) return undefined;
    const created = watchPublicMatchCounters(
      { matchId, organizationAlias, tournamentAlias, stageNumber, matchOrdinal },
      {
        onUpdate: setSnapshot,
        onFinal: (counters) => setSnapshot({ counters, activePenalties: [] }),
      },
    );
    watch.current = created;
    return () => {
      created.dispose();
      watch.current = null;
    };
  }, [finished, matchId, organizationAlias, tournamentAlias, stageNumber, matchOrdinal]);

  useEffect(() => {
    watch.current?.setLive(isLive);
  }, [isLive, matchId, organizationAlias, tournamentAlias, stageNumber, matchOrdinal]);

  useEffect(() => {
    if (over) watch.current?.finish();
  }, [over]);

  const shownCounters = over
    ? snapshot.counters.filter((counter) => counter.scope === 'match')
    : snapshot.counters;
  const views = matchCounterView(shownCounters, sides, language, texts);
  const penalties: readonly MatchPenaltyView[] =
    isLive && !over
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
