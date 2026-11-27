import type { CanvasMatch } from '../bracket-canvas.js';
import type { QualifierLabel } from '../../../lib/side-source.js';
import { requestJson, stagePath } from './transport.js';
import type { EndpointDeps } from './transport.js';

/**
 * One zone's own independent bracket in the seeding canvas — or the stage's only bracket, for an
 * un-zoned stage, which always comes back as exactly one zone entry with no
 * `zoneId`/`zoneName`.
 */
export interface SeedingZoneResponse {
  readonly zoneId?: string;
  readonly zoneName?: string;
  /** The format this zone plays: its own when it declares one, otherwise the stage's. */
  readonly format?: string;
  readonly matches: readonly CanvasMatch[];
}

export interface SeedingResponse {
  readonly stageId: string;
  readonly format: string;
  readonly seeds: readonly { readonly seed: number; readonly entrantId: string }[];
  readonly zones: readonly SeedingZoneResponse[];
  readonly hasRecordedResults: boolean;
  readonly names?: Readonly<Record<string, string>>;
  /** Qualifier positions promotion plans route to each zone; present when any plan targets it. */
  readonly qualifiers?: readonly SeedingQualifierZoneResponse[];
}

export interface QualifierSeedResponse {
  readonly promotionPlanId: string;
  readonly position: number;
  readonly qualifierLabel: QualifierLabel;
}

/** A destination zone of a stage that can be generated ahead: seed `k` is the `k`-th entry. */
export interface SeedingQualifierZoneResponse {
  readonly zoneId?: string;
  readonly zoneName?: string;
  readonly format: string;
  readonly seeds: readonly QualifierSeedResponse[];
}

export interface PublishSeedingRequest {
  readonly seeds?: readonly { readonly seed: number; readonly entrantId: string }[];
  /** Generate the stage ahead from the promotion plans targeting it; `seeds` is ignored. */
  readonly ahead?: boolean;
}

export interface QualificationPositionResponse {
  readonly promotionPlanId: string;
  readonly position: number;
  readonly qualifierLabel: QualifierLabel;
  readonly zoneId?: string;
  readonly zoneName?: string;
  readonly entrantId?: string;
  readonly confirmedEntrantId?: string;
}

export interface QualificationIncompleteMatchResponse {
  readonly matchId: string;
  readonly round: number;
  readonly status: string;
  readonly homeEntrantId?: string;
  readonly awayEntrantId?: string;
}

export interface QualificationTieResponse {
  readonly promotionPlanId: string;
  readonly entrantIds: readonly string[];
  readonly positions: readonly number[];
  readonly groupName?: string;
}

export interface QualificationPreviewResponse {
  readonly state: 'incomplete' | 'tied' | 'ready' | 'confirmed' | 'stale';
  readonly positions: readonly QualificationPositionResponse[];
  readonly incomplete: readonly QualificationIncompleteMatchResponse[];
  readonly tie?: QualificationTieResponse;
  readonly names: Readonly<Record<string, string>>;
}

export interface ConfirmQualificationRequest {
  readonly expected?: readonly {
    readonly promotionPlanId: string;
    readonly position: number;
    readonly entrantId: string;
  }[];
}

export interface ConfirmQualificationResponse extends QualificationPreviewResponse {
  readonly changedSides: number;
}

export interface SeedingClassificationResponse {
  readonly mutationClass: 'safe' | 'requires_rebuild' | 'blocked_after_results';
  readonly reason: string;
  readonly invalidates: readonly string[];
  /** True once the new seed order and fixtures are durably persisted. */
  readonly persisted: boolean;
}

export interface SeedingQualificationApi {
  readonly fetchSeeding: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<SeedingResponse>;

  readonly publishSeeding: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: PublishSeedingRequest,
  ) => Promise<SeedingClassificationResponse>;

  /** Who each qualifier position of a stage generated ahead resolves to; writes nothing. */
  readonly previewQualification?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) => Promise<QualificationPreviewResponse>;

  /** Confirms the previewed qualification; refused if the standings moved since `expected`. */
  readonly confirmQualification?: (
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: ConfirmQualificationRequest,
  ) => Promise<ConfirmQualificationResponse>;
}

export function seedingQualificationEndpoints({
  fetch,
  baseUrl,
}: EndpointDeps): SeedingQualificationApi {
  return {
    fetchSeeding: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<SeedingResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/seeding`,
      ),

    publishSeeding: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<SeedingClassificationResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/seeding`,
        { method: 'POST', body },
      ),

    previewQualification: (organizationAlias, tournamentAlias, stageNumber) =>
      requestJson<QualificationPreviewResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/qualification/preview`,
        { method: 'POST' },
      ),

    confirmQualification: (organizationAlias, tournamentAlias, stageNumber, body) =>
      requestJson<ConfirmQualificationResponse>(
        fetch,
        `${stagePath(baseUrl, organizationAlias, tournamentAlias, stageNumber)}/qualification/confirm`,
        { method: 'POST', body },
      ),
  };
}
