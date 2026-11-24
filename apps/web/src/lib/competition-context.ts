import { applyTemplate } from './matches-view.js';
import {
  formatOverallPlaceFromTemplate,
  formatPlacement,
  placementOf,
  type Placement,
  type SideSourceMessages,
} from './side-source.js';

export interface CompetitionContextInput {
  readonly stageNumber: number;
  readonly stageName?: string;
  readonly zoneName?: string;
  readonly groupName?: string;
  readonly round?: number;
  readonly matchNumber?: number;
  readonly nodeKey?: string;
  readonly sourceFinalRound?: number;
  readonly zoneNodeKeys?: readonly (string | undefined)[];
  readonly placement?: Placement;
  readonly overallPlaceOffset?: number;
}

export interface CompetitionContextLabels {
  /** Fallback template when the organizer left `stageName` blank, e.g. `"Stage {stage}"`. */
  readonly stageHeading: string;
  /** Fallback template for numbered rounds, e.g. `"Round {round}"`. */
  readonly roundHeading: string;
  /** Secondary match ordinal template, e.g. `"Match {match}"`. */
  readonly matchHeading: string;
  readonly finalLabel: string;
  readonly semiFinalLabel: string;
  readonly quarterFinalLabel: string;
  readonly sideSource: SideSourceMessages;
  readonly overallPlaceTemplate?: string;
  readonly formatOverallPlace?: (place: number) => string;
}

export interface CompetitionContext {
  readonly stage: string;
  readonly zone?: string;
  readonly group?: string;
  readonly round?: string;
  readonly parts: readonly string[];
  /** Ordered competition parts joined with `" · "`. */
  readonly line: string;
  /** Secondary match ordinal text (`"Partido N"` / `"Match N"`), when `matchNumber` is positive. */
  readonly matchLabel?: string;
}

/**
 * Group-stage demo data names its single zone `"Grupos"` alongside explicit groups `"Grupo A"`,
 * `"Grupo B"`, ...; repeating `"Grupos"` between stage and group adds noise without context.
 */
export function isImplicitGroupZoneName(zoneName: string | undefined): boolean {
  const normalized = zoneName?.trim().toLowerCase();
  return normalized === 'grupos' || normalized === 'groups';
}

function hasFollowUpPlacementRound(
  from: number,
  to: number,
  roundNum: number,
  zoneNodeKeys: readonly (string | undefined)[] | undefined,
): boolean {
  if (zoneNodeKeys === undefined) return roundNum === 1;
  return zoneNodeKeys.some((key) => {
    if (!key) return false;
    const single = /^(?:placement|place)-(\d+)$/.exec(key);
    if (single) {
      const place = Number(single[1]);
      return place >= from && place <= to;
    }
    const nextRound = new RegExp(`^PL${from}-R(\\d+)-M`).exec(key);
    return nextRound !== null && Number(nextRound[1]) > roundNum;
  });
}

function resolveRoundLabel(
  match: CompetitionContextInput,
  labels: CompetitionContextLabels,
): string | undefined {
  const key = match.nodeKey;
  if (key !== undefined) {
    const se = /^SE-R(\d+)-M\d+(?:-G\d+)?$/.exec(key);
    if (se) {
      const round = match.round ?? Number(se[1]);
      if (match.sourceFinalRound !== undefined) {
        const distance = match.sourceFinalRound - round;
        if (distance === 0) return labels.finalLabel;
        if (distance === 1) return labels.semiFinalLabel;
        if (distance === 2) return labels.quarterFinalLabel;
      }
      return applyTemplate(labels.roundHeading, { round });
    }

    const pl = /^PL(\d+)-R(\d+)-M\d+(?:-G\d+)?$/.exec(key);
    if (pl) {
      const from = Number(pl[1]);
      const roundNum = Number(pl[2]);
      const resolved =
        match.placement ??
        (match.zoneNodeKeys !== undefined ? placementOf(key, match.zoneNodeKeys) : undefined);
      const range: Placement =
        resolved !== undefined && resolved.to !== undefined && resolved.to >= from
          ? resolved
          : { from, to: from + 3 };
      const placesText = formatPlacement(range, labels.sideSource);
      const to = range.to ?? from;
      if (
        range.to !== undefined &&
        to - from === 3 &&
        hasFollowUpPlacementRound(from, to, roundNum, match.zoneNodeKeys)
      ) {
        return `${labels.semiFinalLabel} ${placesText}`;
      }
      return placesText;
    }

    const single = /^(?:placement|place)-(\d+)$/.exec(key);
    if (single) {
      const zonePlace = Number(single[1]);
      const base = formatPlacement({ from: zonePlace }, labels.sideSource);
      if (match.overallPlaceOffset !== undefined) {
        const overall = match.overallPlaceOffset + zonePlace;
        const suffix = labels.formatOverallPlace
          ? labels.formatOverallPlace(overall)
          : labels.overallPlaceTemplate
            ? formatOverallPlaceFromTemplate(
                labels.overallPlaceTemplate,
                overall,
                labels.sideSource,
              )
            : undefined;
        if (suffix) return `${base} · ${suffix}`;
      }
      return base;
    }
  }

  if (match.round !== undefined && match.round > 0) {
    return applyTemplate(labels.roundHeading, { round: match.round });
  }
  return undefined;
}

/**
 * Formats the ordered competition context for a match:
 * stage (organizer's name or `"Fase N"`), explicit zone (omitting `"Grupos"` when a group name
 * is present), explicit group, and graph-aware round name, with the match number kept separate.
 */
export function competitionContext(
  match: CompetitionContextInput,
  labels: CompetitionContextLabels,
): CompetitionContext {
  const trimmedStage = match.stageName?.trim();
  const stage =
    trimmedStage && trimmedStage.length > 0
      ? trimmedStage
      : applyTemplate(labels.stageHeading, { stage: match.stageNumber });

  const trimmedGroup = match.groupName?.trim();
  const group = trimmedGroup && trimmedGroup.length > 0 ? trimmedGroup : undefined;

  const trimmedZone = match.zoneName?.trim();
  const zone =
    trimmedZone &&
    trimmedZone.length > 0 &&
    !(group !== undefined && isImplicitGroupZoneName(trimmedZone))
      ? trimmedZone
      : undefined;

  const round = resolveRoundLabel(match, labels);
  const parts = [stage, zone, group, round].filter((part): part is string => part !== undefined);
  const matchLabel =
    match.matchNumber !== undefined && match.matchNumber > 0
      ? applyTemplate(labels.matchHeading, { match: String(match.matchNumber) })
      : undefined;

  return {
    stage,
    ...(zone === undefined ? {} : { zone }),
    ...(group === undefined ? {} : { group }),
    ...(round === undefined ? {} : { round }),
    parts,
    line: parts.join(' · '),
    ...(matchLabel === undefined ? {} : { matchLabel }),
  };
}
