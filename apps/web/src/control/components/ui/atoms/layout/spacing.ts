/**
 * Shared by the layout atoms (`Stack`, `Inline`, `Grid`, `Box` — openspec
 * 0225 task 2.1). A layout primitive is what makes the tier contract's ban
 * on raw inline lengths checkable at all: `SpacingStep` is the same key set
 * `@copalibre/design-tokens`'s `SPACING` declares, so a primitive can only
 * ever resolve a value the token source actually defines, never an
 * arbitrary length its own type would need to reject at runtime.
 */

export const SPACING_STEPS = ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16'] as const;

export type SpacingStep = (typeof SPACING_STEPS)[number];

/** `var(--cl-space-N)` — never the raw length itself. */
export function spaceVar(step: SpacingStep): string {
  return `var(--cl-space-${step})`;
}
