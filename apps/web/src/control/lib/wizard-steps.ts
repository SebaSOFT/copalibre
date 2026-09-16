/**
 * The step-navigation arithmetic every wizard's own `nextStep`/`previousStep`/
 * `progress` closes over its own steps array for — each wizard keeps its own
 * steps array, step-id union, and exported wrapper; only this shared index math
 * lives here.
 */

export function nextStepId<TId extends string>(
  steps: readonly { readonly id: TId }[],
  currentId: TId,
): TId {
  const index = steps.findIndex((step) => step.id === currentId);
  return steps[Math.min(index + 1, steps.length - 1)]?.id ?? currentId;
}

export function previousStepId<TId extends string>(
  steps: readonly { readonly id: TId }[],
  currentId: TId,
): TId {
  const index = steps.findIndex((step) => step.id === currentId);
  return steps[Math.max(index - 1, 0)]?.id ?? currentId;
}

export function stepProgress<TId extends string>(
  steps: readonly { readonly id: TId }[],
  currentId: TId,
): number {
  const index = steps.findIndex((step) => step.id === currentId);
  return Math.round(((index + 1) / steps.length) * 100);
}
