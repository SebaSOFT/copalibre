import type { LocalizedLabel } from '@copalibre/domain';
import type { TournamentCompletionResponse, components } from '@copalibre/contracts';
import type { MatchCardData } from '../../../lib/matches-view.js';
import type { UploadImageRequest } from './clubs-venues-officials.js';
import type { MutationPreviewResponse } from './stages.js';
import { requestJson, tournamentPath } from './transport.js';
import type { EndpointDeps } from './transport.js';

export interface TournamentSettingsResponse {
  readonly name: string;
  readonly region?: string;
  readonly capacity?: number;
  readonly checkInClosesAt?: string;
  readonly emblemObjectId?: string;
  /** Organizer-set: shown in the public organization page's featured block. */
  readonly featured: boolean;
  readonly includesMinors: boolean;
  readonly showYouthProfiles: boolean;
  /** Minimum minutes between an entrant's matches; absent declares no rest rule. */
  readonly minimumRestMinutes?: number;
}

export type TournamentSettingsRequest = Partial<
  Omit<TournamentSettingsResponse, 'minimumRestMinutes'>
> & {
  /** `null` clears the rule. */
  readonly minimumRestMinutes?: number | null;
};

/** Dot-path → value for a tournament ruleset's override fields. */
export interface RulesetOverridesResponse {
  readonly overrides: Readonly<Record<string, unknown>>;
  /** The installed discipline's field policies — context for the plain-language summary. */
  readonly fieldPolicies: Readonly<Record<string, unknown>>;
  /** The installed discipline's own default configuration tree, before any override. */
  readonly disciplineDefaults: Readonly<Record<string, unknown>>;
}

export interface RulesetOverridesRequest {
  readonly overrides: Readonly<Record<string, unknown>>;
}

export interface CreateTournamentRequest {
  readonly alias: string;
  readonly name: string;
  readonly descriptorId: string;
  readonly descriptorVersion: string;
  /** Every stage of the tournament, in order. At least one is required. */
  readonly stages: readonly CreateTournamentStageRequest[];
  readonly publicRegistration: boolean;
  readonly requiresCheckIn: boolean;
  readonly includesMinors?: boolean;
  readonly checkInClosesAt?: string;
  readonly region?: string;
  readonly capacity?: number;
  readonly profileId?: string;
  readonly profileVersion?: string;
  /** Dot-path → override value for any discipline-declared ruleset field beyond format/registration.*. */
  readonly ruleOverrides?: Readonly<Record<string, unknown>>;
  readonly customScripts: readonly HookScriptAttachment[];
}

export interface CreateTournamentStageRequest {
  readonly number?: number;
  readonly name?: string;
  readonly format: string;
  readonly series?: SeriesDeclaration;
  readonly allocation?: StageAllocationDeclaration;
  readonly groupConfiguration?: StageGroupConfigurationDeclaration;
  /** The stage's zones, numbered by position; absent creates none. */
  readonly zones?: readonly CreateTournamentZoneRequest[];
}

export interface CreateTournamentZoneRequest {
  readonly name: string;
  /** Absent: the zone plays its stage's format. */
  readonly format?: string;
  /** Absent: the zone inherits its stage's series. */
  readonly series?: SeriesDeclaration;
}

export interface StageGroupConfigurationDeclaration {
  readonly groupCount: number;
  readonly groupSize: number;
  readonly distribution: 'balanced' | 'exact-size' | 'overflow-last' | 'manual';
  readonly manualGroupSizes?: readonly number[];
}

export type SeriesResolutionClass = 'best-of' | 'aggregate' | 'points-per-leg';

export interface SeriesDeclaration {
  readonly span: number;
  readonly resolutionClass?: SeriesResolutionClass;
  readonly neutralGround?: boolean;
  /** Absent accounts per match — an undeclared grain has always meant this. */
  readonly standingsAccounting?: SeriesAccountingGrain;
}

export type SeriesAccountingGrain = 'series' | 'match';

/** Mirrors the domain's `StageAllocation` union (`automatic` | `manual` | `weighted`). */
export interface StageAllocationDeclaration {
  readonly mode: 'automatic' | 'manual' | 'weighted';
  readonly attributeKey?: string;
  readonly direction?: 'higher-first' | 'lower-first';
}

export interface EntrantAttributeKeysResponse {
  readonly keys: readonly string[];
}

export interface HookScriptAttachment {
  readonly hook: string;
  readonly script: Readonly<Record<string, unknown>>;
  readonly description?: string;
}

export interface RegistryParameterDefinition {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly parameterTypes: readonly string[];
  readonly allowExpression: boolean;
  readonly valueSchema: Readonly<Record<string, unknown>>;
}

export interface HookVocabularyEntry {
  readonly kind: 'parameter' | 'condition' | 'action' | 'rule';
  readonly type: string;
  readonly description: string;
  readonly authoring?: {
    readonly parameters?: readonly RegistryParameterDefinition[];
    readonly optionsSchema?: Readonly<Record<string, unknown>>;
    readonly valueSchema?: Readonly<Record<string, unknown>>;
    readonly allowExpression?: boolean;
  };
  /** A `{{paramName}}`-placeholder sentence for rendering a configured rule in plain language. */
  readonly phraseTemplate?: string;
}

export interface HookScriptVocabulary {
  readonly hooks: readonly string[];
  readonly entries: readonly HookVocabularyEntry[];
}

export interface TournamentResponse {
  readonly tournamentId: string;
  readonly alias: string;
  readonly name: string;
  readonly rulesetId?: string;
  readonly organizationId?: string;
  readonly status?: 'draft' | 'published' | 'started' | 'finished' | 'archived';
  readonly emblemObjectId?: string;
}

export type TournamentConfigurationExportResponse =
  components['schemas']['TournamentConfigurationExportResponse'];

export interface TournamentsApi {
  readonly createTournament: (
    organizationAlias: string,
    request: CreateTournamentRequest,
  ) => Promise<TournamentResponse>;

  readonly downloadTournamentConfiguration?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<TournamentConfigurationExportResponse>;

  readonly fetchCustomScriptVocabulary?: (
    organizationAlias: string,
  ) => Promise<HookScriptVocabulary>;

  /** Backs weighted allocation's attribute picker. */
  readonly fetchEntrantAttributeKeys?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<EntrantAttributeKeysResponse>;

  /** The organization's active (non-archived) tournaments, for the dashboard. */
  readonly listActiveTournaments?: (
    organizationAlias: string,
  ) => Promise<readonly TournamentResponse[]>;

  /**
   * The matches view: tournament-scoped by default, one
   * stage/group/state when filtered — a query, not a distinct route.
   */
  readonly fetchMatchesView?: (
    organizationAlias: string,
    tournamentAlias: string,
    filter?: {
      readonly stageNumber?: number;
      readonly groupId?: string;
      readonly state?: 'all' | 'live' | 'upcoming' | 'final';
    },
  ) => Promise<{ readonly matches: readonly MatchCardData[] }>;

  /**
   * Tournament completion aggregate summary.
   */
  readonly fetchCompletion?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<TournamentCompletionResponse>;

  readonly fetchTournamentSettings?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<TournamentSettingsResponse>;

  readonly previewTournamentSettings?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: TournamentSettingsRequest,
  ) => Promise<MutationPreviewResponse>;

  readonly updateTournamentSettings?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: TournamentSettingsRequest,
  ) => Promise<TournamentSettingsResponse>;

  readonly fetchRulesetOverrides?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<RulesetOverridesResponse>;

  readonly previewRulesetOverrides?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: RulesetOverridesRequest,
  ) => Promise<MutationPreviewResponse>;

  readonly updateRulesetOverrides?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: RulesetOverridesRequest,
  ) => Promise<RulesetOverridesResponse>;

  /** Archives a finished tournament; legal only from finished. */
  readonly archiveTournament?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<{ readonly status: string }>;

  /** Publishes a draft tournament after the operator reviews its public-data preview. */
  readonly publishTournament?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<TournamentResponse>;

  readonly uploadTournamentEmblem?: (
    organizationAlias: string,
    tournamentAlias: string,
    request: UploadImageRequest,
  ) => Promise<{ readonly objectId: string }>;

  readonly deleteTournamentEmblem?: (
    organizationAlias: string,
    tournamentAlias: string,
  ) => Promise<{ readonly success: boolean }>;
}

export function tournamentsEndpoints({ fetch, baseUrl }: EndpointDeps): TournamentsApi {
  return {
    createTournament: (organizationAlias, body) =>
      requestJson<TournamentResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments`,
        {
          method: 'POST',
          body,
        },
      ),

    fetchCustomScriptVocabulary: (organizationAlias) =>
      requestJson<HookScriptVocabulary>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/custom-script-vocabulary`,
      ),

    fetchEntrantAttributeKeys: (organizationAlias, tournamentAlias) =>
      requestJson<EntrantAttributeKeysResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/entrant-attribute-keys`,
      ),

    listActiveTournaments: (organizationAlias) =>
      requestJson<readonly TournamentResponse[]>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments`,
      ),

    fetchMatchesView: (organizationAlias, tournamentAlias, filter = {}) => {
      const params = new URLSearchParams();
      if (filter.stageNumber !== undefined) params.set('stageNumber', String(filter.stageNumber));
      if (filter.groupId !== undefined) params.set('groupId', filter.groupId);
      if (filter.state !== undefined) params.set('state', filter.state);
      const query = params.size > 0 ? `?${params}` : '';
      return requestJson<components['schemas']['ControlMatchesViewResponse']>(
        fetch,
        `${tournamentPath(baseUrl, organizationAlias, tournamentAlias)}/internal-matches-view${query}`,
      ).then(({ matches }) => ({
        matches: matches.map((row): MatchCardData => {
          const { status, latestEvent, ...match } = row;
          const rest = { ...match };
          delete (rest as { decidingFactor?: unknown }).decidingFactor;
          return {
            ...rest,
            ...(latestEvent === undefined
              ? {}
              : {
                  latestEvent: {
                    definitionCode: latestEvent.definitionCode,
                    label: latestEvent.label,
                    ...(latestEvent.labels === undefined
                      ? {}
                      : { labels: latestEvent.labels as LocalizedLabel }),
                    occurredAt: latestEvent.occurredAt,
                  },
                }),
            state: status,
          };
        }),
      }));
    },

    fetchCompletion: (organizationAlias, tournamentAlias) =>
      requestJson<TournamentCompletionResponse>(
        fetch,
        `${tournamentPath(baseUrl, organizationAlias, tournamentAlias)}/completion`,
      ),

    fetchTournamentSettings: (organizationAlias, tournamentAlias) =>
      requestJson<TournamentSettingsResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/settings`,
      ),

    previewTournamentSettings: (organizationAlias, tournamentAlias, body) =>
      requestJson<MutationPreviewResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/settings/preview`,
        { method: 'POST', body },
      ),

    updateTournamentSettings: (organizationAlias, tournamentAlias, body) =>
      requestJson<TournamentSettingsResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/settings`,
        { method: 'PUT', body },
      ),

    fetchRulesetOverrides: (organizationAlias, tournamentAlias) =>
      requestJson<RulesetOverridesResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/ruleset-overrides`,
      ),

    previewRulesetOverrides: (organizationAlias, tournamentAlias, body) =>
      requestJson<MutationPreviewResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/ruleset-overrides/preview`,
        { method: 'POST', body },
      ),

    updateRulesetOverrides: (organizationAlias, tournamentAlias, body) =>
      requestJson<RulesetOverridesResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(
          tournamentAlias,
        )}/ruleset-overrides`,
        { method: 'PUT', body },
      ),

    downloadTournamentConfiguration: (organizationAlias, tournamentAlias) =>
      requestJson<TournamentConfigurationExportResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/export`,
      ),

    archiveTournament: (organizationAlias, tournamentAlias) =>
      requestJson<{ readonly status: string }>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/archive`,
        { method: 'POST' },
      ),

    publishTournament: (organizationAlias, tournamentAlias) =>
      requestJson<TournamentResponse>(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/publish`,
        { method: 'POST' },
      ),

    uploadTournamentEmblem: (organizationAlias, tournamentAlias, body) =>
      requestJson(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/emblem`,
        { method: 'POST', body },
      ),

    deleteTournamentEmblem: (organizationAlias, tournamentAlias) =>
      requestJson(
        fetch,
        `${baseUrl}/organizations/${encodeURIComponent(organizationAlias)}/tournaments/${encodeURIComponent(tournamentAlias)}/emblem`,
        { method: 'DELETE' },
      ),
  };
}
