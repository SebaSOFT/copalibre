import { CONTROL_DENSITY_SPACING } from '../../primitives.js';

/**
 * Control-web's denser spacing composition, scoped to `[data-density="control"]`
 * so the exact same atoms render tighter there than on the marketing surfaces —
 * a composition choice, not a second component tree.
 */
export function density(): string {
  return [
    '[data-density="control"] {',
    ...Object.entries(CONTROL_DENSITY_SPACING).map(
      ([name, value]) => `  --cl-density-${name}: ${value};`,
    ),
    '}',
  ].join('\n');
}
