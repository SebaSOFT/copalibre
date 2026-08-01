/**
 * The tournament setup wizard (0023).
 *
 * Four steps, and a step may not be left until it is valid — a wizard that lets
 * you reach the end with an empty field is a wizard that fails on submit, after
 * the operator has forgotten which screen the field was on.
 */

export type WizardStepId = 'name' | 'discipline' | 'format' | 'window';

export const WIZARD_STEPS: readonly { readonly id: WizardStepId; readonly label: string }[] = [
  { id: 'name', label: 'Nombre' },
  { id: 'discipline', label: 'Disciplina' },
  { id: 'format', label: 'Formato' },
  { id: 'window', label: 'Ventana' },
];

export interface DisciplineOption {
  readonly descriptorId: string;
  readonly version: string;
  readonly name: string;
  readonly supportedFormats: readonly string[];
}

export interface WizardState {
  readonly step: WizardStepId;
  readonly alias?: string;
  readonly name?: string;
  readonly descriptorId?: string;
  readonly descriptorVersion?: string;
  readonly format?: string;
  readonly region?: string;
  readonly capacity?: number;
  readonly publicRegistration: boolean;
  readonly requiresCheckIn: boolean;
}

export function initialWizard(): WizardState {
  return { step: 'name', publicRegistration: false, requiresCheckIn: false };
}

/**
 * Formats the chosen discipline declares.
 *
 * Read from the API's discipline list, never from a copy in the client: a
 * hardcoded list disagrees with the installation the day somebody adds a
 * module, and the disagreement shows up as a format that cannot be generated.
 */
export function formatsFor(
  disciplines: readonly DisciplineOption[],
  descriptorId: string | undefined,
): readonly string[] {
  return disciplines.find((one) => one.descriptorId === descriptorId)?.supportedFormats ?? [];
}

/** What is missing on this step, in words the operator can act on. */
export function stepProblems(
  state: WizardState,
  disciplines: readonly DisciplineOption[],
): readonly string[] {
  switch (state.step) {
    case 'name':
      return [
        ...(state.name === undefined || state.name.trim() === '' ? ['Falta el nombre'] : []),
        ...(state.alias === undefined || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(state.alias)
          ? ['El alias va en minúscula, con guiones']
          : []),
      ];
    case 'discipline':
      return state.descriptorId === undefined ? ['Elegí una disciplina'] : [];
    case 'format': {
      if (state.format === undefined) return ['Elegí un formato'];
      // Guards against a stale selection: changing the discipline after
      // choosing a format must not carry the old one through.
      return formatsFor(disciplines, state.descriptorId).includes(state.format)
        ? []
        : ['Ese formato no lo soporta la disciplina elegida'];
    }
    case 'window':
      return state.capacity !== undefined && state.capacity < 2
        ? ['Un torneo necesita al menos dos participantes']
        : [];
  }
}

export function canContinue(state: WizardState, disciplines: readonly DisciplineOption[]): boolean {
  return stepProblems(state, disciplines).length === 0;
}

export function nextStep(state: WizardState): WizardStepId {
  const index = WIZARD_STEPS.findIndex((step) => step.id === state.step);
  return WIZARD_STEPS[Math.min(index + 1, WIZARD_STEPS.length - 1)]?.id ?? state.step;
}

export function previousStep(state: WizardState): WizardStepId {
  const index = WIZARD_STEPS.findIndex((step) => step.id === state.step);
  return WIZARD_STEPS[Math.max(index - 1, 0)]?.id ?? state.step;
}

export function progress(state: WizardState): number {
  const index = WIZARD_STEPS.findIndex((step) => step.id === state.step);
  return Math.round(((index + 1) / WIZARD_STEPS.length) * 100);
}

/**
 * The submission, which records the descriptor **version**.
 *
 * A ruleset that tracked "latest" would change under a tournament already being
 * played; the version chosen here is the one frozen with it.
 */
export function toCreateRequest(state: WizardState): {
  readonly alias: string;
  readonly name: string;
  readonly descriptorId: string;
  readonly descriptorVersion: string;
  readonly format: string;
  readonly publicRegistration: boolean;
  readonly requiresCheckIn: boolean;
} {
  if (
    state.alias === undefined ||
    state.name === undefined ||
    state.descriptorId === undefined ||
    state.descriptorVersion === undefined ||
    state.format === undefined
  ) {
    throw new Error('The wizard is not complete');
  }
  return {
    alias: state.alias,
    name: state.name,
    descriptorId: state.descriptorId,
    descriptorVersion: state.descriptorVersion,
    format: state.format,
    publicRegistration: state.publicRegistration,
    requiresCheckIn: state.requiresCheckIn,
  };
}
