import type { DisciplineDescriptor } from './discipline-descriptor.js';
import type { OverrideSet } from './override-policy.js';
import type { TableLayoutDefinition } from './table-layout.js';

/**
 * `tableLayouts` sits outside `defaults` — real typed data, not a config
 * knob — so it never passes through `compileEffectiveRuleset`, which only
 * ever reads and writes `descriptor.defaults`. This is the dedicated,
 * narrower resolver `fieldPolicies['tableLayouts']` actually governs: a whole
 * -array replacement, permitted only when the descriptor's own policy for
 * this field grants `{ permission: { kind: 'replaced' } }`.
 */
export function resolveEffectiveTableLayouts(
  descriptor: DisciplineDescriptor,
  overrides?: OverrideSet,
): readonly TableLayoutDefinition[] {
  const override = overrides?.['tableLayouts'];
  const policy = descriptor.fieldPolicies['tableLayouts'];
  if (override !== undefined && policy?.permission.kind === 'replaced') {
    return override as readonly TableLayoutDefinition[];
  }
  return descriptor.tableLayouts ?? [];
}

export function findTableLayout(
  descriptor: DisciplineDescriptor,
  layoutCode: string,
  overrides?: OverrideSet,
): TableLayoutDefinition | undefined {
  return resolveEffectiveTableLayouts(descriptor, overrides).find(
    (layout) => layout.code === layoutCode,
  );
}
