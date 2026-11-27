import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import type { SupportedLanguage } from '@copalibre/domain';
import type { LiveDashboard } from '../../lib/live-state.js';
import type { PublicSeriesState } from '../../lib/series.js';
import type { StandingsRowView } from '../../lib/overview.js';
import type { BracketZone } from '../../lib/bracket-projection.js';
import type { PinnedMatchRef } from '../../lib/tv-dashboard-source.js';
import type { TvMatchEntry } from '../../lib/tv-match-list.js';
import type { TvMatchEvent } from '../../lib/tv-match-events.js';
import type { TopPerformer, TvStatisticsLabels } from '../../lib/tv-statistics.js';
import type { TvBranding } from '../../lib/tv-branding.js';
import type { TvClubItem, TvDashboardLabels, TvWinnerZone } from './tv-types.js';

/**
 * `lower` is a compact score bug meant to sit over a camera feed; `full` is a
 * self-contained broadcast scene for a stream with no camera source; `kiosk`
 * (the default) is the venue display.
 */
export type TvPresentation = 'kiosk' | 'scorebug' | 'lower' | 'full';
export type TvLayoutVariant = 'kiosk' | 'presentation' | 'dashboard';

export interface TvDashboardProps {
  readonly initial: LiveDashboard;
  readonly streamPath: string;
  /**
   * Supplied by the server from the request URL. Deriving it from
   * `window.location` instead meant the first response — the one a broadcast
   * consumer actually captures — never carried the overlay presentation.
   */
  readonly presentation?: TvPresentation;
  /** Server-selected full-frame composition, shared by the kiosk, live scene and dashboard. */
  readonly layoutVariant?: TvLayoutVariant;
  /**
   * Set on the pinned-match route; the full-rotation route leaves this unset. The match is named
   * the way the public match route names it, by its stage and its ordinal within that stage.
   */
  readonly pinnedMatch?: PinnedMatchRef;
  /**
   * Keeps a launcher-selected view fixed and full-frame instead of entering carousel rotation:
   * `standings` fills the frame with the table, `matches` with the paged match list.
   */
  readonly initialView?: 'standings' | 'matches';
  /**
   * An overlay follows the live match of this court (a venue name) instead of a pinned match: the
   * match whose venue, by `venueNameByMatchId`, is it. Without a pinned match or a court an overlay
   * shows no match at all, never an arbitrary one.
   */
  readonly court?: string;
  readonly venueNameByMatchId?: Readonly<Record<string, string>>;
  /** The series state of each match that is part of one, by match id. */
  readonly seriesByMatchId?: Readonly<Record<string, PublicSeriesState>>;
  /** The organization's IANA zone, in which the header's clock is read. */
  readonly timeZone?: string;
  /** The date of the tournament's last match, shown as the day a finished tournament ended. */
  readonly lastMatchAt?: string;
  /**
   * The pinned match's own recorded events (goals, cards), set only on the pinned-match route —
   * the full-rotation route leaves this unset, same as `pinnedMatchNumber`.
   * Empty or unset renders no ticker section at all, rather than an empty-state placeholder.
   */
  readonly matchEvents?: readonly TvMatchEvent[];
  /** Recent events for the displayed live matches, by match id. */
  readonly matchEventsById?: Readonly<Record<string, readonly TvMatchEvent[]>>;
  /** `matchId -> personId -> display text`, resolved from each match report. */
  readonly rosterActorsByMatchId?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * `personId -> display text`, from the pinned match's own rosters —
   * set only alongside `matchEvents`, on the pinned-match
   * route. Resolves a live alert's actor the same way the initial
   * `matchEvents` ticker already resolves one; a `Map` would not survive
   * this island's own JSON prop serialization.
   */
  readonly rosterActors?: Readonly<Record<string, string>>;
  readonly initialBracket?: {
    readonly stageNumber: number;
    /** Zones playing an elimination format: drawn as a bracket. */
    readonly zones: readonly BracketZone[];
  };
  /**
   * Every match of the tournament as list entries, for the `matches` section: it pages through
   * them. Absent or empty leaves the dashboard without that section.
   */
  readonly matchList?: readonly TvMatchEntry[];
  readonly branding?: TvBranding;
  readonly tournamentName?: string;
  readonly organizationName?: string;
  readonly organizationAlias?: string;
  readonly tournamentAlias?: string;
  readonly clubs?: readonly TvClubItem[];
  /**
   * The champions the public projection resolved for each zone of the last stage. When present they
   * are the recap of a finished tournament; a standings leader of an earlier stage never is.
   */
  readonly winners?: readonly TvWinnerZone[];
  readonly standings?: readonly StandingsRowView[];
  /** The stage the standings table belongs to; its name heads the tables. */
  readonly standingsStageNumber?: number;
  /** The standings table's declared layout, which the full-frame standings view widens by. */
  readonly standingsProjection?: TableProjectionResponse;
  readonly topPerformers?: readonly TopPerformer[];
  /**
   * The discipline's own player-ranking projection. Passing `undefined` sends
   * `deriveTopPerformers` down its standings fallback, which is what this
   * surface did unconditionally before: the projection branch never ran outside
   * its own tests.
   */
  readonly performerProjection?: TableProjectionResponse;
  readonly labels: TvStatisticsLabels;
  /**
   * The dashboard's own chrome text — separate
   * from `labels`, which is `tv-statistics.ts`'s derived-stat vocabulary.
   * No client-side react-intl is threaded into this component: every
   * string it renders arrives pre-formatted, the same as `labels` already
   * does, since this crosses into a `client:load` island whose props Astro
   * serializes as JSON.
   */
  readonly dashboardLabels: TvDashboardLabels;
  readonly language: SupportedLanguage;
  readonly pollIntervalMs?: number;
  readonly referenceDate?: number;
}
