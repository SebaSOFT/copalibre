import { useEffect, useMemo, useRef, useState } from 'react';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import { isDelayed } from '../../lib/match-state.js';
import {
  presentDelayedState,
  presentState,
  type StatePresentation,
} from '../../lib/result-state.js';
import { competitionContext } from '../../lib/competition-context.js';
import type { TvMatchEvent } from '../../lib/tv-match-events.js';
import { applyTemplate } from '../../lib/matches-view.js';
import { formatTimestamp } from '../../lib/format-timestamp.js';
import { findPinnedMatch, type PinnedMatchRef } from '../../lib/tv-dashboard-source.js';
import { nextTvMatches } from '../../lib/tv-match-list.js';
import { groupStandingsByZone } from '../../lib/overview.js';
import {
  deriveTopPerformers,
  deriveTournamentFacts,
  tvTournamentState,
  type TopPerformer,
  type TournamentFact,
} from '../../lib/tv-statistics.js';
import { resolveTvBranding } from '../../lib/tv-branding.js';
import { tvMatchProgress } from '../../lib/tv-match-progress.js';
import { useHydrated, usePrefersReducedMotion } from '../../lib/island-browser-state.js';
import { holdsBracketMatch } from './ui/organisms/TvBracketView.js';
import { TvScorebug } from './ui/organisms/TvScorebug.js';
import { TvMatchIndicators } from './ui/organisms/TvMatchIndicators.js';
import { TvMatchCounters } from './ui/organisms/TvMatchCounters.js';
import { TvStatusBadge } from './ui/atoms/TvStatusBadge.js';
import { LiveMatchClock } from '../ui/atoms/LiveMatchClock.js';
import {
  BroadcastAlertBanner,
  type BroadcastAlertItem,
} from './ui/organisms/BroadcastAlertBanner.js';
import { TvPresentationLayout } from './TvPresentationLayout.js';
import { TvMultiMatchDashboard } from './ui/organisms/TvMultiMatchDashboard.js';
import { TvOverlayScene } from './ui/organisms/TvOverlayScene.js';
import { TvFocalPanel } from './TvFocalPanel.js';
import { TvRailPanel } from './TvRailPanel.js';
import { useTvWallClock } from './use-tv-wall-clock.js';
import { useTvProjectionRefresh } from './use-tv-projection-refresh.js';
import { useTvRealtime } from './use-tv-realtime.js';
import { useTvRotation } from './use-tv-rotation.js';
import { useTvBracket } from './use-tv-bracket.js';
import { useTvPaging } from './use-tv-paging.js';
import {
  championOf,
  clockForMatch,
  leadingTvSide,
  noMatchMessageOf,
  pinnedStandingsOf,
  type RailTab,
  spotlightMatchOf,
  standingsStageNameOf,
  statusBadgeOf,
  statusToneOf,
} from './tv-dashboard-model.js';
import type { TvDashboardProps } from './tv-dashboard-types.js';

export type { TvClubItem, TvDashboardLabels, TvWinnerZone } from './tv-types.js';
export type { TvDashboardProps, TvLayoutVariant, TvPresentation } from './tv-dashboard-types.js';
export {
  leadingTvSide,
  pinnedStandingsOf,
  standingsColumnsFitting,
  standingsColumnsOf,
  standingsStageNameOf,
  viewportVmin,
} from './tv-dashboard-model.js';

export function TvDashboard({
  initial,
  streamPath,
  presentation = 'kiosk',
  layoutVariant = 'kiosk',
  pinnedMatch: pinnedRef,
  court,
  venueNameByMatchId,
  seriesByMatchId,
  timeZone,
  lastMatchAt,
  matchEvents,
  matchEventsById,
  rosterActorsByMatchId,
  rosterActors,
  initialBracket,
  matchList,
  branding,
  tournamentName,
  organizationName,
  organizationAlias,
  tournamentAlias,
  clubs,
  winners,
  standings,
  standingsStageNumber,
  standingsProjection,
  topPerformers: initialTopPerformers,
  performerProjection,
  labels,
  dashboardLabels,
  language,
  pollIntervalMs = 15_000,
  initialView,
  referenceDate,
}: TvDashboardProps): React.JSX.Element {
  const [dashboard, setDashboard] = useState<LiveDashboard>(initial);
  const [liveMatchEvents, setLiveMatchEvents] = useState(matchEvents ?? []);
  const [initialMatchEventIds] = useState(() => (matchEvents ?? []).map((event) => event.eventId));
  const [liveMatchEventsById, setLiveMatchEventsById] = useState(() => {
    const current = { ...matchEventsById };
    const pinned =
      pinnedRef === undefined ? undefined : findPinnedMatch(initial.matches, pinnedRef);
    if (pinned && matchEvents?.length) current[pinned.matchId] = matchEvents;
    return current;
  });
  const [initialMatchEventIdsById] = useState(() => {
    const initialIds = Object.fromEntries(
      Object.entries(matchEventsById ?? {}).map(([matchId, events]) => [
        matchId,
        events.map((event) => event.eventId),
      ]),
    );
    const pinned =
      pinnedRef === undefined ? undefined : findPinnedMatch(initial.matches, pinnedRef);
    if (pinned && matchEvents?.length) {
      initialIds[pinned.matchId] = matchEvents.map((event) => event.eventId);
    }
    return initialIds;
  });
  const [scheduledMatches, setScheduledMatches] = useState(matchList ?? []);
  const scheduleVersions = useRef(
    new Map((matchList ?? []).map((entry) => [entry.key, entry.scheduleVersion ?? 0])),
  );
  const entrantVersions = useRef(new Map<string, number>());
  // The rail's tab set is decided once, from what the first render already holds, so a rotation or a
  // late poll never inserts or removes a tab.
  const [railTabs] = useState<readonly RailTab[]>(() => {
    if (pinnedRef !== undefined) {
      const pinnedStandingRows = pinnedStandingsOf(
        standings,
        findPinnedMatch(dashboard.matches, pinnedRef),
        standingsStageNumber,
      );
      return [
        ...(pinnedStandingRows.length > 0 ? (['standings'] as const) : []),
        ...(initialBracket && initialBracket.zones.length > 0 ? (['bracket'] as const) : []),
        'performers',
        'recent',
      ];
    }
    return [
      'standings',
      'performers',
      'facts',
      ...(initialBracket && initialBracket.zones.length > 0 ? (['bracket'] as const) : []),
      ...((matchList ?? []).length > 0 ? (['fixtures'] as const) : []),
    ];
  });
  const [rail, setRail] = useState<{ readonly tab: RailTab; readonly page: number }>(() => {
    const first = railTabs.includes('standings') ? 'standings' : (railTabs[0] ?? 'standings');
    return { tab: initialView === 'matches' ? 'fixtures' : first, page: 0 };
  });
  const activeTab = rail.tab;
  const setActiveTab = (tab: typeof rail.tab): void => setRail({ tab, page: 0 });
  const [projectionStale, setProjectionStale] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const hydrated = useHydrated();
  // The corner bug and the lower third are strips over footage; the full frame is a scene.
  const isCornerOverlay = presentation === 'scorebug' || presentation === 'lower';
  const showBroadcastAlerts = presentation !== 'kiosk';
  const resolvedBranding = resolveTvBranding(branding ?? {});
  const [alertQueue, setAlertQueue] = useState<readonly BroadcastAlertItem[]>([]);
  const standingsPanelRef = useRef<HTMLElement>(null);
  const railStandingsRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef(dashboard);
  useEffect(() => {
    dashboardRef.current = dashboard;
  }, [dashboard]);
  const eventLabelsByCode = useMemo(
    () =>
      Object.fromEntries(
        [matchEvents ?? [], ...Object.values(matchEventsById ?? {})]
          .flat()
          .map((event) => [event.definitionCode, event.label]),
      ),
    [matchEvents, matchEventsById],
  );

  const { currentTime, clockZoneLabel, effectiveNow } = useTvWallClock({
    language,
    timeZone,
    referenceDate,
  });
  const refreshProjection = useTvProjectionRefresh({
    organizationAlias,
    tournamentAlias,
    dashboardLabels,
    pollIntervalMs,
    scheduleVersions,
    setDashboard,
    setProjectionStale,
    setScheduledMatches,
  });
  useTvRealtime({
    streamPath,
    presentation,
    refreshProjection,
    pinnedRef,
    showBroadcastAlerts,
    matchList,
    rosterActors,
    rosterActorsByMatchId,
    eventLabelsByCode,
    entrantVersions,
    scheduleVersions,
    dashboardRef,
    setDashboard,
    setScheduledMatches,
    setProjectionStale,
    setLiveMatchEventsById,
    setLiveMatchEvents,
    setAlertQueue,
  });

  const {
    matchPages,
    standingsPageCount,
    activeStandingsPage,
    dashboardStandings,
    railPaging,
    fullFrameColumns,
  } = useTvPaging({
    matches: dashboard.matches,
    scheduledMatches,
    resultState: dashboardLabels.resultState,
    layoutVariant,
    activeTab,
    railPage: rail.page,
    standings,
    standingsProjection,
    standingsStageNumber,
    language,
    initialView,
    pinnedRef,
    standingsPanelRef,
    railStandingsRef,
  });

  // 5. Data Computations
  const matches = dashboard.matches;
  const pinnedMatch = pinnedRef === undefined ? undefined : findPinnedMatch(matches, pinnedRef);
  // A pinned route names one match; one that does not exist is said so, never swapped for another.
  const pinnedMissing = pinnedRef !== undefined && pinnedMatch === undefined;

  const liveMatches = matches.filter((m) => m.state === 'live');
  // The next-match strip lists the scheduled matches that are not delayed; the featured panel's
  // fallback order is in featuredTvMatch.
  const upcomingMatches = nextTvMatches(matches, effectiveNow, 4);
  const tournamentState = tvTournamentState(matches);
  const allFinal = tournamentState === 'finished';
  const isLive = liveMatches.length > 0;
  // The stage the standings belong to names the tables.
  const standingsStageName = standingsStageNameOf(matches, standingsStageNumber);
  // Every table is headed by its group or zone when the stage has several, judged on the whole
  // standings rather than the page on screen; the pinned route always names its group.
  const standingsTableCount = groupStandingsByZone(standings ?? []).length;
  const scopeStandingsHeadings = pinnedRef !== undefined || standingsTableCount > 1;
  // Only the full-frame standings view widens its table, and only by the declared columns that fit the
  // frame's width; the rail keeps the compact columns.
  // The rail moves through every page of a list before it leaves the list's tab. Under reduced motion the
  // tabs hold still, but the pages keep turning: paging is navigation, not decoration.
  const tabsMove = !prefersReducedMotion;
  useTvRotation({
    tabsMove,
    initialView,
    matchPagesCount: matchPages.length,
    railPageCount: railPaging.pageCount,
    railTabs,
    setRail,
  });

  const winnerZones = winners ?? [];
  const champion = championOf({ labels, winners, matches, standings, clubs });
  const showZoneChampions = allFinal && winnerZones.length > 0 && champion === undefined;
  // The recap belongs to the rotating dashboard alone: a pinned match and a fixed view mean what
  // they say, finished tournament or not.
  const isRotatingDashboard = pinnedRef === undefined && initialView === undefined;
  const showRecap =
    isRotatingDashboard && allFinal && (champion !== undefined || showZoneChampions);
  // The fallback ranks clubs when no player-ranking projection exists, and the tab says so.
  const performersAreTeams =
    (performerProjection?.rows.length ?? 0) === 0 && (initialTopPerformers?.length ?? 0) === 0;
  const performersTabLabel = performersAreTeams
    ? dashboardLabels.performersTeamsTab
    : dashboardLabels.performersTab;
  const performers: readonly TopPerformer[] =
    initialTopPerformers && initialTopPerformers.length > 0
      ? initialTopPerformers
      : deriveTopPerformers(labels, language, performerProjection, standings, clubs);
  const facts: readonly TournamentFact[] = deriveTournamentFacts(labels, matches);
  // Spotlight Match (pinned match or active live match or first non-delayed upcoming match)
  // An overlay is composited over one match: the pinned one, or the live match of its court. With
  // neither it shows no match, since a guess would put the same match on every overlay.
  const isOverlayPresentation = presentation !== 'kiosk';
  const venueOf = (match: LiveMatch): string | undefined =>
    match.venueName ?? venueNameByMatchId?.[match.matchId];
  const courtMatch =
    court === undefined ? undefined : liveMatches.find((match) => venueOf(match) === court);
  const spotlightMatch = spotlightMatchOf({
    pinnedRef,
    pinnedMatch,
    court,
    courtMatch,
    isOverlayPresentation,
    liveMatches,
    matches,
    effectiveNow,
  });
  const isMatchDelayed = (match: LiveMatch): boolean =>
    isDelayed(match, effectiveNow) && dashboardLabels.delayed !== undefined;
  const matchBadgeFor = (match: LiveMatch): StatePresentation =>
    isMatchDelayed(match) && dashboardLabels.delayed !== undefined
      ? presentDelayedState(dashboardLabels.delayed)
      : presentState(match.state, dashboardLabels.resultState);
  const spotlightDelayed = spotlightMatch !== undefined && isMatchDelayed(spotlightMatch);
  const statusBadge = statusBadgeOf(
    dashboardLabels,
    statusToneOf({ isLive, tournamentState, spotlightDelayed }),
  );
  const leadingSide = leadingTvSide(spotlightMatch);
  const noMatchMessage = noMatchMessageOf(dashboardLabels, pinnedMissing, court);
  const progress = tvMatchProgress(
    spotlightMatch,
    spotlightMatch === undefined ? undefined : seriesByMatchId?.[spotlightMatch.matchId],
    language,
  );
  const bracketStage = spotlightMatch?.stageNumber;
  const undecidedSide = dashboardLabels.resultState.tbd;
  const { bracketData, bracketStale } = useTvBracket({
    initialBracket,
    organizationAlias,
    tournamentAlias,
    bracketStage,
    isCornerOverlay,
    pollIntervalMs,
    undecidedSide,
  });
  const showStaleMark = projectionStale || bracketStale;
  const visibleBracket = bracketData?.stageNumber === bracketStage ? bracketData : undefined;
  // The bracket centres the match the screen is about: the pinned match, else the featured one. A
  // bracket names its matches by node key within a zone, so the match is found by its zone and node
  // key, and only when it belongs to the stage the bracket draws.
  const focusMatch = pinnedMatch ?? spotlightMatch;
  const bracketFocus =
    focusMatch?.nodeKey !== undefined && focusMatch.stageNumber === visibleBracket?.stageNumber
      ? { nodeKey: focusMatch.nodeKey, zoneName: focusMatch.zoneName }
      : undefined;
  // A pinned match's rail draws only the zone that holds it: its own path, not the whole stage.
  const pinnedZones =
    pinnedMatch === undefined || bracketFocus === undefined
      ? undefined
      : visibleBracket?.zones.filter((zone) => holdsBracketMatch(zone, bracketFocus));
  const railBracketZones =
    pinnedMatch !== undefined && pinnedZones !== undefined && pinnedZones.length > 0
      ? pinnedZones
      : (visibleBracket?.zones ?? []);
  const spotlightClock = clockForMatch(spotlightMatch);
  const clockLabels = {
    clockStopped: dashboardLabels.clockStopped,
    clockAriaLabel: dashboardLabels.clockAriaLabel,
  };
  const showsWallClock = !allFinal && currentTime !== '';
  const finishedText =
    allFinal && lastMatchAt !== undefined
      ? applyTemplate(dashboardLabels.finishedOn, {
          date: formatTimestamp(lastMatchAt, { locale: language, format: 'date-long', timeZone }),
        })
      : undefined;

  /*
   * A lower third is a strip, not a scene: it names the two sides, their score
   * and the match state, and leaves the rest of the frame to the footage it is
   * composited over. Everything the kiosk shows around that — the rotating
   * rail, the standings, the champion recap — belongs to a full-frame
   * presentation, not over someone's camera.
   */
  const onAlertConsumed = (eventId: string): void => {
    setAlertQueue((current) => current.filter((item) => item.event.eventId !== eventId));
  };
  const broadcastAlertBanner = showBroadcastAlerts ? (
    <BroadcastAlertBanner
      awayLabel={labels.awaySide}
      homeLabel={labels.homeSide}
      onConsumed={onAlertConsumed}
      prefersReducedMotion={prefersReducedMotion}
      queue={alertQueue}
    />
  ) : null;

  const fixedView = initialView !== undefined;
  // The presentation layout and the kiosk focal panel show a pinned match's counters under each side;
  // the dashboard layout and a fixed rail view have no spotlight, so the header keeps them there.
  const pinnedSpotlightShowsCounters =
    pinnedRef !== undefined &&
    (layoutVariant === 'presentation' || (layoutVariant === 'kiosk' && !fixedView));
  const matchContextOf = (match: LiveMatch) => {
    const zoneOffset =
      visibleBracket?.stageNumber === match.stageNumber
        ? visibleBracket.zones.find((zone) => zone.zoneName === match.zoneName)?.overallPlaceOffset
        : undefined;
    return competitionContext(
      {
        stageNumber: match.stageNumber,
        stageName: match.stageName,
        zoneName: match.zoneName,
        groupName: match.groupName,
        round: match.round,
        matchNumber: match.stageOrdinal ?? match.matchNumber,
        nodeKey: match.nodeKey,
        sourceFinalRound: match.sourceFinalRound,
        zoneNodeKeys: match.zoneNodeKeys,
        ...(zoneOffset === undefined ? {} : { overallPlaceOffset: zoneOffset }),
      },
      dashboardLabels.contextLabels,
    );
  };
  const labelStage = (ref: PinnedMatchRef | undefined): string =>
    ref === undefined ? '' : `${ref.stageNumber} · ${ref.ordinal}`;
  const eventsForMatch = (matchId: string): readonly TvMatchEvent[] =>
    liveMatchEventsById[matchId] ?? [];
  const eventIdsForMatch = (matchId: string): readonly string[] =>
    initialMatchEventIdsById[matchId] ?? [];
  const pinnedStageLabel = labelStage(pinnedRef);

  if (isCornerOverlay) {
    return (
      <TvOverlayScene
        presentation={presentation}
        hydrated={hydrated}
        dashboardLabels={dashboardLabels}
        language={language}
        clubs={clubs}
        timeZone={timeZone}
        effectiveNow={effectiveNow}
        spotlightMatch={spotlightMatch}
        spotlightClock={spotlightClock}
        clockLabels={clockLabels}
        progress={progress}
        noMatchMessage={noMatchMessage}
        showStaleMark={showStaleMark}
        broadcastAlertBanner={broadcastAlertBanner}
        scope={
          spotlightMatch === undefined
            ? undefined
            : matchList?.find((entry) => entry.key === spotlightMatch.matchId)?.scope
        }
        venueOf={venueOf}
        isMatchDelayed={isMatchDelayed}
      />
    );
  }

  return (
    <div
      className={`tv-root-container tv-root-container--${layoutVariant}`}
      data-hydrated={hydrated ? '' : undefined}
      data-layout={layoutVariant}
    >
      {showStaleMark && dashboardLabels.stale && (
        <p className="cl-inline-alert cl-inline-alert--warning tv-stale-mark" role="status">
          {dashboardLabels.stale}
        </p>
      )}
      {broadcastAlertBanner}
      {/* 1. Persistent Score-Bug / Status Bar */}

      <TvScorebug
        logoUrl={resolvedBranding.logoUrl}
        organizationName={organizationName ?? 'CopaLibre Broadcast'}
        tournamentName={tournamentName ?? 'Torneo Oficial'}
      >
        <TvMatchIndicators
          match={spotlightMatch}
          possessionLabel={dashboardLabels.possession}
          penaltyLabel={dashboardLabels.penalty}
        />
        {/* A pinned spotlight shows the counters in full, so the header omits them there. */}
        {!pinnedSpotlightShowsCounters && (
          <TvMatchCounters
            density="compact"
            language={language}
            match={spotlightMatch}
            texts={dashboardLabels.counters}
          />
        )}
        <TvStatusBadge label={statusBadge.label} tone={statusBadge.type} />
        {spotlightClock && (
          <LiveMatchClock
            className="tv-scorebug__clock tv-scorebug__game-clock"
            clock={spotlightClock}
            labels={clockLabels}
            segmentLabel={progress.segmentLabel}
            variant="tv"
          />
        )}
        {showsWallClock && (
          <span className="tv-scorebug__wall-clock-group">
            <span className="tv-scorebug__clock-label">{dashboardLabels.clockLabel}</span>
            <span
              className="tv-scorebug__clock tv-scorebug__clock--wall"
              data-time={currentTime}
              role={spotlightClock ? undefined : 'timer'}
              aria-label={`${dashboardLabels.clockLabel} ${currentTime}`}
            />
            {clockZoneLabel && <span className="tv-scorebug__clock-zone">{clockZoneLabel}</span>}
          </span>
        )}
        {finishedText !== undefined && (
          <span
            className="tv-scorebug__clock tv-scorebug__clock--finished"
            data-time={finishedText}
            aria-label={finishedText}
          />
        )}
      </TvScorebug>

      {layoutVariant === 'presentation' ? (
        <TvPresentationLayout
          dashboardLabels={dashboardLabels}
          labels={labels}
          language={language}
          clubs={clubs}
          timeZone={timeZone}
          effectiveNow={effectiveNow}
          spotlightMatch={spotlightMatch}
          spotlightClock={spotlightClock}
          clockLabels={clockLabels}
          progress={progress}
          leadingSide={leadingSide}
          isMatchDelayed={isMatchDelayed}
          matchBadgeFor={matchBadgeFor}
          matchContextOf={matchContextOf}
          venueOf={venueOf}
          eventsForMatch={eventsForMatch}
          eventIdsForMatch={eventIdsForMatch}
          visibleBracket={visibleBracket}
          bracketFocus={bracketFocus}
          standings={standings}
          standingsStageName={standingsStageName}
          scopeStandingsHeadings={scopeStandingsHeadings}
          upcomingMatches={upcomingMatches}
          venueNameByMatchId={venueNameByMatchId}
        />
      ) : layoutVariant === 'dashboard' ? (
        <TvMultiMatchDashboard
          dashboardLabels={dashboardLabels}
          labels={labels}
          language={language}
          clubs={clubs}
          timeZone={timeZone}
          effectiveNow={effectiveNow}
          liveMatches={liveMatches}
          upcomingMatches={upcomingMatches}
          matchContextOf={matchContextOf}
          eventsForMatch={eventsForMatch}
          eventIdsForMatch={eventIdsForMatch}
          clockLabels={clockLabels}
          venueNameByMatchId={venueNameByMatchId}
          standingsPanelRef={standingsPanelRef}
          standingsPageCount={standingsPageCount}
          activeStandingsPage={activeStandingsPage}
          scopeStandingsHeadings={scopeStandingsHeadings}
          standingsStageName={standingsStageName}
          dashboardStandings={dashboardStandings}
        />
      ) : (
        <main className={fixedView ? 'tv-main-stage tv-main-stage--single' : 'tv-main-stage'}>
          {!fixedView && (
            <TvFocalPanel
              dashboardLabels={dashboardLabels}
              labels={labels}
              language={language}
              clubs={clubs}
              timeZone={timeZone}
              effectiveNow={effectiveNow}
              tournamentName={tournamentName}
              showRecap={showRecap}
              isRotatingDashboard={isRotatingDashboard}
              showZoneChampions={showZoneChampions}
              allFinal={allFinal}
              champion={champion}
              winnerZones={winnerZones}
              spotlightMatch={spotlightMatch}
              spotlightClock={spotlightClock}
              clockLabels={clockLabels}
              progress={progress}
              liveMatchEvents={liveMatchEvents}
              initialMatchEventIds={initialMatchEventIds}
              isOverlayPresentation={isOverlayPresentation}
              pinnedMissing={pinnedMissing}
              pinnedStageLabel={pinnedStageLabel}
              noMatchMessage={noMatchMessage}
              matchContextOf={matchContextOf}
              isMatchDelayed={isMatchDelayed}
              matchBadgeFor={matchBadgeFor}
              venueOf={venueOf}
            />
          )}
          <TvRailPanel
            dashboardLabels={dashboardLabels}
            labels={labels}
            language={language}
            clubs={clubs}
            timeZone={timeZone}
            effectiveNow={effectiveNow}
            fixedView={fixedView}
            railTabs={railTabs}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            performersTabLabel={performersTabLabel}
            pinnedRef={pinnedRef}
            pinnedMatch={pinnedMatch}
            matches={matches}
            railPaging={railPaging}
            railPage={rail.page}
            railStandingsRef={railStandingsRef}
            fullFrameColumns={fullFrameColumns}
            scopeStandingsHeadings={scopeStandingsHeadings}
            standingsStageName={standingsStageName}
            performers={performers}
            facts={facts}
            visibleBracket={visibleBracket}
            railBracketZones={railBracketZones}
            bracketFocus={bracketFocus}
            matchPages={matchPages}
          />
        </main>
      )}
    </div>
  );
}
