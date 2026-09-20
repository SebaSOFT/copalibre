/**
 * Pure derivations behind the discipline plain-language summary
 * (`DisciplineSummary`, `ui/organisms/discipline-summary.tsx`). Kept apart
 * from the component so every branch here is testable without rendering —
 * the same split `wizard.ts`/`TournamentSetupWizard.tsx` already use.
 */
import {
  mergeWithStrategy,
  type ConfigFieldPolicies,
  type EventDefinition,
  type FieldPolicy,
  type RulesetConfig,
  type SegmentTypeDefinition,
} from '@copalibre/domain';

/**
 * Only the `EventDefinition` fields the summary renders — never the full
 * type (which requires `payloadSchema`, an event-recording concern this
 * display-only component has no use for). Lets a caller such as the
 * discipline-authoring wizard, whose draft events never carry a
 * `payloadSchema`, feed this component without synthesizing one.
 */
export type EventSummaryData = Pick<
  EventDefinition,
  'code' | 'label' | 'description' | 'actorRequirement' | 'effects'
>;

/**
 * The slice of a `DisciplineDescriptor` the summary renders — no fetching,
 * no other fields. `segmentTypes`/`eventDefinitions` are optional so a
 * caller that only has rule data (e.g. the tournament ruleset override
 * editor, which never fetches the full descriptor) can render just the
 * rules section without synthesizing empty arrays for the other two.
 */
export interface DisciplineSummaryData {
  readonly segmentTypes?: readonly SegmentTypeDefinition[];
  readonly eventDefinitions?: readonly EventSummaryData[];
  readonly defaults: RulesetConfig;
  readonly fieldPolicies: ConfigFieldPolicies;
}

/**
 * Whether an event can change a match's result — `effects` alone decides
 * this, never `category`. The domain layer is explicit that category is
 * presentation-only (`segment-threshold-events.ts`: "category must never
 * imply an effect").
 */
export function eventAffectsResult(event: EventSummaryData): boolean {
  return (
    event.effects?.some(
      (effect) =>
        effect.kind === 'score' || effect.kind === 'statistic' || effect.kind === 'match-state',
    ) ?? false
  );
}

export type EventActorMessageKey = 'side' | 'person' | 'personOrStaff' | 'none';

/** Which plain-language actor sentence an event's `actorRequirement` maps to. */
export function eventActorMessageKey(event: EventSummaryData): EventActorMessageKey {
  switch (event.actorRequirement) {
    case 'side':
      return 'side';
    case 'person':
      return 'person';
    case 'person-or-staff':
      return 'personOrStaff';
    default:
      return 'none';
  }
}

/** A dot-path's current configured value from `defaults`, `undefined` when absent. */
export function fieldValueAt(defaults: RulesetConfig, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((node, key) => {
    if (node === undefined || node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[key];
  }, defaults);
}

function setAtPath(config: Record<string, unknown>, dotPath: string, value: unknown): void {
  const segments = dotPath.split('.');
  const last = segments.pop() as string;
  let node = config;
  for (const key of segments) {
    const next = node[key];
    if (typeof next !== 'object' || next === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[last] = value;
}

/**
 * Overlays dot-path override values onto a discipline's default configuration
 * tree, so a rule field's "current value" reflects what a tournament actually
 * has configured, not just the discipline's own baseline. Used by the
 * ruleset-override editor, the one consumer with a separate overrides
 * document to reconcile against defaults.
 *
 * A `replaced` field's stored override IS its final value — a plain overlay.
 * A `merged` field's stored override is only the delta/patch the compiler
 * applies on top of the inherited value (`mergeWithStrategy`, the same
 * function `packages/domain`'s own compiler uses) — overlaying it directly,
 * as this function once did, shows an operator the delta instead of the real
 * effective value (e.g. only the tiebreaker just added, not the discipline's
 * whole tiebreaker order plus the addition).
 */
export function mergeOverrides(
  defaults: RulesetConfig,
  overrides: Readonly<Record<string, unknown>>,
  fieldPolicies: ConfigFieldPolicies,
): RulesetConfig {
  const merged: Record<string, unknown> = structuredClone(defaults) as Record<string, unknown>;
  for (const [dotPath, value] of Object.entries(overrides)) {
    const policy = fieldPolicies[dotPath];
    if (policy?.permission.kind === 'merged') {
      const current = fieldValueAt(merged, dotPath);
      const result = mergeWithStrategy(policy.permission.strategy, current, value, dotPath);
      if (result.ok) {
        setAtPath(merged, dotPath, result.value);
        continue;
      }
      // A shape mismatch (e.g. stored data predates a strategy change) — this
      // is a display path, not the compiler, so fall through to the plain
      // overlay rather than throwing.
    }
    setAtPath(merged, dotPath, value);
  }
  return merged;
}

/** One rule field, resolved for display — its dot-path, policy, and current value. */
export interface RuleFieldSummary {
  readonly dotPath: string;
  readonly policy: FieldPolicy;
  readonly value: unknown;
}

/** Every declared field policy paired with its current configured value, in declaration order. */
export function ruleFieldSummaries(data: DisciplineSummaryData): readonly RuleFieldSummary[] {
  return Object.entries(data.fieldPolicies).map(([dotPath, policy]) => ({
    dotPath,
    policy,
    value: fieldValueAt(data.defaults, dotPath),
  }));
}

/**
 * A segment's default duration as short display text — "5 min" or "45 sec",
 * never pluralized: an abbreviation sidesteps per-language plural grammar
 * for a value most catalogues never translate anyway (English fallback).
 */
export function formatSegmentDuration(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} sec`;
}

/** Renders a scalar/array configured value as short display text; an object renders as JSON. */
export function formatFieldValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map((entry) => formatFieldValue(entry)).join(', ');
  return JSON.stringify(value);
}

/**
 * A field's current value, for inferring what kind of control edits it — the
 * tournament's own stored override first (it is sometimes the only place a
 * value exists at all, e.g. `format`/`registration.*` on a wizard-authored
 * discipline whose own `defaults` is `{}`), falling back to the discipline's
 * default.
 */
export function observedFieldValue(
  overrides: Readonly<Record<string, unknown>>,
  disciplineDefaults: RulesetConfig,
  dotPath: string,
): unknown {
  // `overrides` is flat, keyed by the literal dot-path string (as the
  // RulesetOverrides wire shape stores it) — a direct lookup, never a
  // nested-tree traversal like `fieldValueAt` performs on `defaults`.
  const overridden = overrides[dotPath];
  if (overridden !== undefined) return overridden;
  return fieldValueAt(disciplineDefaults, dotPath);
}

/**
 * Which control shape edits a field, derived from its declared policy and
 * observed value — never a new per-field schema (design.md's Non-Goals).
 * `undefined` means the field is not editable at all (`forbidden`/`inherited`).
 */
export type ControlKind =
  'checkbox' | 'number' | 'text' | 'format-select' | 'add-to-list' | 'patch-object' | 'raw-json';

export function chooseControlKind(
  policy: FieldPolicy | undefined,
  observedValue: unknown,
  dotPath: string,
): ControlKind | undefined {
  if (policy === undefined) return 'raw-json';
  if (policy.permission.kind === 'forbidden' || policy.permission.kind === 'inherited') {
    return undefined;
  }
  if (policy.permission.kind === 'merged') {
    return policy.permission.strategy === 'shallow-object' ? 'patch-object' : 'add-to-list';
  }
  // permission.kind === 'replaced'
  if (dotPath === 'format') return 'format-select';
  switch (typeof observedValue) {
    case 'boolean':
      return 'checkbox';
    case 'number':
      return 'number';
    case 'string':
      return 'text';
    default:
      return 'raw-json';
  }
}
