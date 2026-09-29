import type { MessageDescriptor } from 'react-intl';
import { messages } from '../i18n/messages.en.js';

/**
 * The stage list both `TournamentSetupWizard` and `ProfileBuilderWizard` author —
 * one shared shape and one shared set of helpers, so the two wizards' stage
 * editors never drift (design.md, "Stage list replaces the single `format`/series
 * fields, not a superset of them").
 */

export type SeriesResolutionClass = 'best-of' | 'aggregate' | 'points-per-leg';

export const SERIES_RESOLUTION_CLASSES: readonly SeriesResolutionClass[] = [
  'best-of',
  'aggregate',
  'points-per-leg',
];

export type SeriesAccountingGrain = 'series' | 'match';

/** Absence (`stage.series === undefined`) means "no series declared", not a zero-span one. */
export interface StageSeriesDraft {
  readonly span?: number;
  readonly resolutionClass?: SeriesResolutionClass;
  readonly neutralGround: boolean;
  readonly standingsAccounting: SeriesAccountingGrain;
}

export function emptySeriesDraft(): StageSeriesDraft {
  return { neutralGround: false, standingsAccounting: 'match' };
}

export type AllocationMode = 'automatic' | 'manual' | 'weighted';
export type SeedDirection = 'higher-first' | 'lower-first';

export const ALLOCATION_MODES: readonly AllocationMode[] = ['automatic', 'manual', 'weighted'];

/** Absence (`stage.allocation === undefined`) leaves the caller to supply seeds explicitly. */
export interface StageAllocationDraft {
  readonly mode: AllocationMode;
  readonly attributeKey?: string;
  readonly direction?: SeedDirection;
}

export interface WizardStageDraft {
  /** 1-based order within the wizard's stage list. */
  readonly number: number;
  readonly name: string;
  readonly format: string;
  readonly series?: StageSeriesDraft;
  readonly allocation?: StageAllocationDraft;
}

/** A stage list of one, the shape every wizard starts from. */
export function initialStages(format = ''): readonly WizardStageDraft[] {
  return [{ number: 1, name: '', format }];
}

/** Keeps `number` a contiguous 1-based sequence after an add or a remove — never a gap or a duplicate. */
export function renumbered(stages: readonly WizardStageDraft[]): readonly WizardStageDraft[] {
  return stages.map((stage, index) => ({ ...stage, number: index + 1 }));
}

export function appendStage(
  stages: readonly WizardStageDraft[],
  format = '',
): readonly WizardStageDraft[] {
  return renumbered([...stages, { number: stages.length + 1, name: '', format }]);
}

export function removeStage(
  stages: readonly WizardStageDraft[],
  number: number,
): readonly WizardStageDraft[] {
  return renumbered(stages.filter((stage) => stage.number !== number));
}

export function replaceStage(
  stages: readonly WizardStageDraft[],
  number: number,
  patch: Partial<WizardStageDraft>,
): readonly WizardStageDraft[] {
  return stages.map((stage) => (stage.number === number ? { ...stage, ...patch } : stage));
}

/**
 * Placement formats produce an ordering, not two sides that could contest a
 * series — a stage carrying one of these cannot also declare a series. Client
 * copy of the server's own refusal (`isPlacementFormat`), so the operator meets
 * it while authoring rather than on submit.
 */
export const PLACEMENT_FORMATS: readonly string[] = ['free-for-all', 'heats'];

/**
 * The same two series refusals `wizard.ts` checked tournament-wide before this
 * change, now scoped to one stage — a placement-format stage among several
 * stages is refused independent of the other stages' validity.
 */
export function stageProblems(stage: WizardStageDraft): readonly MessageDescriptor[] {
  const problems: MessageDescriptor[] = [];
  if (stage.format.trim() === '') problems.push(messages.wizardProblemChooseFormat);

  if (stage.series !== undefined) {
    if (PLACEMENT_FORMATS.includes(stage.format)) {
      problems.push(messages.wizardProblemSeriesOnPlacementFormat);
    }
    if (
      stage.series.span === undefined ||
      !Number.isInteger(stage.series.span) ||
      stage.series.span < 2
    ) {
      problems.push(messages.wizardProblemSeriesSpan);
    } else if (stage.series.resolutionClass === 'best-of' && stage.series.span % 2 === 0) {
      problems.push(messages.wizardProblemSeriesEvenBestOf);
    }
  }

  if (
    stage.allocation?.mode === 'weighted' &&
    (stage.allocation.attributeKey ?? '').trim() === ''
  ) {
    problems.push(messages.wizardProblemAllocationAttributeKey);
  }

  return problems;
}
