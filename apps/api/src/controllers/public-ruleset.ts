import {
  compileEffectiveRuleset,
  standardFieldLabel,
  type DisciplineDescriptor,
  type LocalizedLabel,
  type TournamentRuleset,
} from '@copalibre/domain';

/** A dot-path's value in a compiled ruleset's nested config tree, `undefined` when absent. */
function fieldValueAt(config: Record<string, unknown>, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((node, key) => {
    if (node === undefined || node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[key];
  }, config);
}

/** Enrolment settings (capacity, check-in) govern who may sign up, not how the tournament is played. */
const ENROLMENT_NAMESPACE = 'registration.';

export interface PublicRuleset {
  readonly ruleset: Record<string, string>;
  readonly labels: Record<string, string | LocalizedLabel>;
}

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/**
 * What a spectator can read as one line: a scalar, or an ordered list of them (the tiebreakers). A
 * list entry that is a declared statistic reads as its code. Anything else has no single value.
 */
function printable(value: unknown): string | undefined {
  if (isScalar(value)) return String(value);
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const parts = value.map((entry: unknown) =>
    isScalar(entry)
      ? String(entry)
      : typeof (entry as { statisticCode?: unknown } | null)?.statisticCode === 'string'
        ? String((entry as { statisticCode: string }).statisticCode)
        : undefined,
  );
  return parts.every((part) => part !== undefined) ? parts.join(',') : undefined;
}

/**
 * The rules a spectator reads: each scalar field the discipline declares, at the value in force —
 * its default, or the tournament's override when it has one. A tournament that overrides nothing
 * still lists its defaults. Structured fields (table layouts, win conditions) have no single
 * value to print and are left to the pages that explain them.
 *
 * When the ruleset cannot be compiled the stored overrides are listed as they are, so the public
 * page never breaks on a descriptor problem.
 */
export function publicRuleset(
  descriptor: DisciplineDescriptor | undefined,
  tournamentRuleset: TournamentRuleset | undefined,
): PublicRuleset {
  const ruleset: Record<string, string> = {};
  const labels: Record<string, string | LocalizedLabel> = {};
  const labelOf = (dotPath: string): string | LocalizedLabel | undefined =>
    descriptor?.fieldPolicies[dotPath]?.label ?? standardFieldLabel(dotPath);
  const add = (dotPath: string, value: unknown): void => {
    const text = printable(value);
    if (text === undefined) return;
    ruleset[dotPath] = text;
    const label = labelOf(dotPath);
    if (label !== undefined) labels[dotPath] = label;
  };

  const compiled = descriptor ? compileEffectiveRuleset(descriptor, tournamentRuleset) : undefined;
  if (descriptor && compiled?.ok) {
    for (const dotPath of Object.keys(descriptor.fieldPolicies)) {
      if (dotPath.startsWith(ENROLMENT_NAMESPACE)) continue;
      add(dotPath, fieldValueAt(compiled.value.config, dotPath));
    }
    return { ruleset, labels };
  }

  for (const [dotPath, value] of Object.entries(tournamentRuleset?.overrides ?? {})) {
    add(dotPath, value);
  }
  return { ruleset, labels };
}
