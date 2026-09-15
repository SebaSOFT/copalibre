import type { MessageDescriptor } from 'react-intl';
import { messages } from '../i18n/messages.en.js';
import type { AuthoredModuleRequest } from './api-client.js';
import {
  emptyLocalizedDraft,
  localizedValue,
  type LocalizedDraft,
} from './descriptor-authoring.js';
import type { DisciplineOption } from './wizard.js';
import {
  stageProblems as stageAllocationProblems,
  type WizardStageDraft,
} from './stage-authoring.js';
import { nextStepId, previousStepId, stepProgress } from './wizard-steps.js';

export { renumbered } from './stage-authoring.js';

/**
 * The tournament profile builder wizard (openspec 0164).
 *
 * A profile is discipline-neutral by schema — it never names a discipline —
 * but this wizard asks for one anyway, purely to check each stage's format
 * against what that discipline declares before submission (spec.md's "refuse
 * a stage whose format that discipline does not declare"). The chosen
 * discipline's alias travels only as `disciplineAlias` on the request, never
 * into the authored document itself.
 */

export type ProfileStepId = 'name' | 'authorship' | 'stages' | 'points';

export const PROFILE_STEPS: readonly {
  readonly id: ProfileStepId;
  readonly label: MessageDescriptor;
}[] = [
  { id: 'name', label: messages.profileStepName },
  { id: 'authorship', label: messages.profileStepAuthorship },
  { id: 'stages', label: messages.profileStepStages },
  { id: 'points', label: messages.profileStepPoints },
];

/**
 * A profile's stage shares `TournamentSetupWizard`'s stage shape (design.md,
 * "one shared stage-editor component") but never declares `series` — a
 * profile is discipline-neutral and has no per-tournament series concept of
 * its own; it declares only format and a default seeding `allocation`.
 */
export type ProfileStageDraft = WizardStageDraft;

export interface ProfileWizardState {
  readonly step: ProfileStepId;
  readonly alias: string;
  readonly version: string;
  readonly name: LocalizedDraft;
  readonly description: LocalizedDraft;
  readonly author: string;
  readonly licence: string;
  readonly sourceUrl: string;
  readonly disciplineAlias: string;
  readonly stages: readonly ProfileStageDraft[];
  readonly pointsWin: number;
  readonly pointsDraw: number;
  readonly pointsLoss: number;
}

export function initialProfileWizard(): ProfileWizardState {
  return {
    step: 'name',
    alias: '',
    version: '0.1.0',
    name: emptyLocalizedDraft(),
    description: emptyLocalizedDraft(),
    author: '',
    licence: 'AGPL-3.0-only',
    sourceUrl: '',
    disciplineAlias: '',
    stages: [],
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
  };
}

export const ALIAS_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function nextStep(state: ProfileWizardState): ProfileStepId {
  return nextStepId(PROFILE_STEPS, state.step);
}

export function previousStep(state: ProfileWizardState): ProfileStepId {
  return previousStepId(PROFILE_STEPS, state.step);
}

export function progress(state: ProfileWizardState): number {
  return stepProgress(PROFILE_STEPS, state.step);
}

export function formatsFor(
  disciplines: readonly DisciplineOption[],
  disciplineAlias: string,
): readonly string[] {
  return (
    disciplines.find((discipline) => discipline.alias === disciplineAlias)?.supportedFormats ?? []
  );
}

export function stepProblems(
  state: ProfileWizardState,
  disciplines: readonly DisciplineOption[],
): readonly MessageDescriptor[] {
  switch (state.step) {
    case 'name':
      return [
        ...(ALIAS_PATTERN.test(state.alias) ? [] : [messages.profileProblemAliasFormat]),
        ...(state.version.trim() === '' ? [messages.profileProblemVersion] : []),
        ...(state.name.en.trim() === '' ? [messages.profileProblemNameEnglish] : []),
      ];
    case 'authorship':
      return [
        ...(state.author.trim() === '' ? [messages.profileProblemAuthor] : []),
        ...(state.licence.trim() === '' ? [messages.profileProblemLicence] : []),
      ];
    case 'stages': {
      const problems: MessageDescriptor[] = [];
      if (state.disciplineAlias.trim() === '') problems.push(messages.profileProblemDiscipline);
      if (state.stages.length === 0) problems.push(messages.profileProblemNoStages);
      const allowed = formatsFor(disciplines, state.disciplineAlias);
      if (
        state.disciplineAlias.trim() !== '' &&
        state.stages.some((stage) => !allowed.includes(stage.format))
      ) {
        problems.push(messages.profileProblemStageFormat);
      }
      problems.push(...state.stages.flatMap(stageAllocationProblems));
      return problems;
    }
    case 'points':
      return state.pointsWin < 0 || state.pointsDraw < 0 || state.pointsLoss < 0
        ? [messages.profileProblemNegativePoints]
        : [];
  }
}

export function canContinue(
  state: ProfileWizardState,
  disciplines: readonly DisciplineOption[],
): boolean {
  return stepProblems(state, disciplines).length === 0;
}

export function canSubmit(
  state: ProfileWizardState,
  disciplines: readonly DisciplineOption[],
): boolean {
  return PROFILE_STEPS.every(
    (step) => stepProblems({ ...state, step: step.id }, disciplines).length === 0,
  );
}

export function toAuthoredDocument(state: ProfileWizardState): Record<string, unknown> {
  const name = localizedValue(state.name);
  if (name === undefined) throw new Error('The wizard is not complete');
  const description = localizedValue(state.description);

  return {
    alias: state.alias,
    version: state.version,
    name,
    ...(description === undefined ? {} : { description }),
    attribution: {
      author: state.author,
      licence: state.licence,
      ...(state.sourceUrl.trim() === '' ? {} : { sourceUrl: state.sourceUrl.trim() }),
    },
    requires: [],
    stages: state.stages.map((stage) => ({
      number: stage.number,
      name: stage.name,
      format: stage.format,
      ...(stage.allocation === undefined ? {} : { allocation: stage.allocation }),
    })),
    points: { win: state.pointsWin, draw: state.pointsDraw, loss: state.pointsLoss },
    tiebreak: [],
  };
}

export function toAuthoredModuleRequest(state: ProfileWizardState): AuthoredModuleRequest {
  return {
    kind: 'tournament-profile',
    document: toAuthoredDocument(state),
    disciplineAlias: state.disciplineAlias,
  };
}
