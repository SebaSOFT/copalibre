import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * Where a script may run.
 *
 * 0010 needed hook points for the draw and defined them inside
 * `draw-constraints.ts`, as a detail of one feature. Four evaluations now
 * attach scripts — eligibility and advancement guards, the win condition,
 * notification rules and draw constraints — and 0014 adds match control,
 * timers and alerts. One taxonomy, owned by the core, is what stops each of
 * those growing a private one.
 *
 * A hook is an identifier, the context a script may read at it, and its
 * polarity. It is deliberately not a callback: a callback is imperative, and an
 * imperative hook cannot be replayed, audited, or shipped inside a JSON module.
 */

/** What silence means. A guard denies; everything else permits. */
export type HookPolarity = 'permissive' | 'default-deny';

/**
 * Whether anything reaches this hook yet, and who owns it if not.
 *
 * A taxonomy this size invites hooks nothing evaluates, which read as features
 * that do not work. Recording the owning phase makes an attachment to one
 * *inert* — reported, not silently accepted.
 */
export type HookEvaluation =
  | { readonly status: 'evaluated'; readonly by: string }
  | { readonly status: 'declared'; readonly ownedBy: string; readonly note?: string };

export interface ScriptHook {
  readonly id: ScriptHookId;
  /** Dot-paths a script may read here, environment paths included. */
  readonly context: readonly string[];
  readonly polarity: HookPolarity;
  readonly evaluation: HookEvaluation;
}

/**
 * Published at every hook: which competition this is, and what time it is.
 *
 * `now`, `uuid` and `random` are **values**, sampled once by the caller and
 * recorded with the evaluation. As functions they would each make a replay
 * disagree with the original; as inputs they replay exactly.
 *
 * Every instant is epoch milliseconds — storage, transport and context alike.
 * A rule that genuinely reasons about a local calendar passes
 * `tournament.timeZone` explicitly; rendering an instant for a person is the
 * control panel's job.
 */
export const ENVIRONMENT_CONTEXT_PATHS = [
  'now',
  'uuid',
  'random',
  'discipline.descriptorId',
  'discipline.version',
  'discipline.statistics',
  'discipline.segmentTypes',
  'tournament.id',
  'tournament.alias',
  'tournament.status',
  'tournament.timeZone',
  'tournament.points',
  'tournament.tiebreaks',
  'stage.number',
  'stage.name',
  'stage.format',
  'stage.allocation',
  'organization.id',
  'organization.alias',
  'organization.name',
] as const;

/**
 * A match and its sides, at any arity.
 *
 * `sides.N.home` is `true`, `false`, or `null` where the concept does not
 * apply — neutral ground, a free-for-all heat. Home advantage is a property of
 * a side, not of a match: it is what venue assignment reads when it decides
 * whose ground a fixture is played at, and that decision is per side.
 */
const MATCH_CONTEXT_PATHS = [
  'match.id',
  'match.status',
  'match.startedAt',
  'match.finishedAt',
  'match.sides.N.entrantId',
  'match.sides.N.name',
  'match.sides.N.home',
  'match.sides.N.value',
  'match.sides.N.placement',
] as const;

const SEGMENT_CONTEXT_PATHS = [
  'segment.id',
  'segment.type',
  'segment.number',
  'segment.startedAt',
  'segment.finishedAt',
  'segment.regulationSeconds',
  'segment.sides.N.entrantId',
  'segment.sides.N.value',
] as const;

/**
 * Why a match or segment paused, so a rule concerned with only one kind filters
 * on a fact instead of requiring a hook of its own. `pause.kind` is
 * open-vocabulary: `regulation`, `incident`, `operator`, and whatever a
 * discipline needs after them.
 */
const PAUSE_CONTEXT_PATHS = ['pause.kind', 'pause.reason'] as const;

/**
 * A score change, published raw: the hook fires on *every* change and the
 * context carries enough for a rule to say which ones it cares about.
 *
 * `home`/`away` are derived and present only where exactly one side is home —
 * a condition compares scalars and Neuron does not iterate, so a rule cannot
 * search the sides for the one carrying `home: true`. The core does that lookup
 * once. Where no side claims it, both are absent rather than invented, and
 * `value_exists` is how a rule tests for that.
 */
const SCORE_CONTEXT_PATHS = [
  'score.previous',
  'score.current',
  'score.leaderChanged',
  'score.decisive',
  'score.sides.N.entrantId',
  'score.sides.N.value',
  'score.sides.N.placement',
  'score.sides.N.home',
  'score.home',
  'score.away',
  'score.leader.entrantId',
  'score.leader.value',
  'score.margin',
] as const;

const EVENT_CONTEXT_PATHS = [
  'event.id',
  'event.definitionCode',
  'event.category',
  'event.side',
  'event.personId',
  'event.recordedAt',
  'event.payload.*',
] as const;

/**
 * Running totals for the declared collectors, keyed by collector code.
 *
 * Published so a rule reasons about "the fifth yellow" without fetching
 * anything: a script has no I/O, and a threshold that had to be told its own
 * total would push the fetch into every caller — which is how two callers end
 * up disagreeing about what the total was.
 *
 * `total` is the figure at the collector's own granularity for the actor the
 * event names. `sinceLastConsequence` is the same count restricted to what has
 * accumulated since the rule last recorded one, which is how "five cards and
 * then start again" is a window on the rule rather than a reset of the
 * collector: the career total stays whole and independent of the disciplinary
 * history.
 */
const COLLECTOR_CONTEXT_PATHS = [
  'collectors.*.total',
  'collectors.*.samples',
  'collectors.*.sinceLastConsequence',
] as const;

const STAGE_LIFECYCLE_CONTEXT_PATHS = [
  'stage.id',
  'stage.status',
  'stage.startedAt',
  'stage.finishedAt',
] as const;

const ALERT_CONTEXT_PATHS = [
  'alert.code',
  'alert.severity',
  'alert.raisedAt',
  'alert.values.*',
] as const;

/**
 * 0010 places the proposed assignment under `draw`, shaped by the caller rather
 * than by a published contract. The subtree is published as a whole until the
 * phase that pins it does so; a wildcard is the honest statement of what the
 * hook currently guarantees.
 */
const DRAW_CONTEXT_PATHS = ['draw.*'] as const;

/** Guards place their facts at the context root, likewise caller-shaped. */
const GUARD_CONTEXT_PATHS = ['*'] as const;

interface HookDefinition {
  readonly context: readonly string[];
  readonly polarity: HookPolarity;
  readonly evaluation: HookEvaluation;
}

/**
 * The taxonomy. The `draw.*`, `seed.*`, `schedule.*`, `entrant.*` and
 * `stage.advance` entries keep the identifiers 0010 gave them, so every
 * constraint declared before this change validates and evaluates unchanged.
 */
const HOOK_DEFINITIONS = {
  'draw.assign-group': {
    context: [...DRAW_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'evaluated', by: '0010' },
  },
  'draw.pair-round': {
    context: [...DRAW_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'evaluated', by: '0010' },
  },
  'seed.order': {
    context: [...DRAW_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'evaluated', by: '0010' },
  },
  'schedule.assign-slot': {
    context: [...DRAW_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: {
      status: 'declared',
      ownedBy: '0012',
      note: 'Rest rules and venue conflicts are detected natively; the scripted form is unevaluated',
    },
  },
  'entrant.eligibility': {
    context: [...GUARD_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'default-deny',
    evaluation: { status: 'declared', ownedBy: '0021' },
  },
  'stage.advance': {
    context: [...GUARD_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'default-deny',
    evaluation: {
      status: 'declared',
      ownedBy: '0010',
      note: 'Qualification admissibility is computed natively; the scripted form is unevaluated',
    },
  },
  'match.started': {
    context: [...MATCH_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'declared', ownedBy: '0014' },
  },
  'match.paused': {
    context: [...MATCH_CONTEXT_PATHS, ...PAUSE_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'declared', ownedBy: '0014' },
  },
  'match.resumed': {
    context: [...MATCH_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'declared', ownedBy: '0014' },
  },
  'match.finished': {
    context: [...MATCH_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'declared', ownedBy: '0014' },
  },
  'segment.started': {
    context: [...MATCH_CONTEXT_PATHS, ...SEGMENT_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'declared', ownedBy: '0014' },
  },
  'segment.paused': {
    context: [
      ...MATCH_CONTEXT_PATHS,
      ...SEGMENT_CONTEXT_PATHS,
      ...PAUSE_CONTEXT_PATHS,
      ...ENVIRONMENT_CONTEXT_PATHS,
    ],
    polarity: 'permissive',
    evaluation: { status: 'declared', ownedBy: '0014' },
  },
  'segment.finished': {
    context: [...MATCH_CONTEXT_PATHS, ...SEGMENT_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'declared', ownedBy: '0014' },
  },
  'score.changed': {
    context: [
      ...MATCH_CONTEXT_PATHS,
      ...SEGMENT_CONTEXT_PATHS,
      ...SCORE_CONTEXT_PATHS,
      ...ENVIRONMENT_CONTEXT_PATHS,
    ],
    polarity: 'permissive',
    evaluation: { status: 'declared', ownedBy: '0014' },
  },
  'event.recorded': {
    context: [
      ...MATCH_CONTEXT_PATHS,
      ...SEGMENT_CONTEXT_PATHS,
      ...EVENT_CONTEXT_PATHS,
      ...COLLECTOR_CONTEXT_PATHS,
      ...ENVIRONMENT_CONTEXT_PATHS,
    ],
    polarity: 'permissive',
    evaluation: { status: 'evaluated', by: '0133' },
  },
  'stage.started': {
    context: [...STAGE_LIFECYCLE_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'declared', ownedBy: '0014' },
  },
  'stage.finished': {
    context: [...STAGE_LIFECYCLE_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: { status: 'declared', ownedBy: '0014' },
  },
  'alert.raised': {
    context: [...MATCH_CONTEXT_PATHS, ...ALERT_CONTEXT_PATHS, ...ENVIRONMENT_CONTEXT_PATHS],
    polarity: 'permissive',
    evaluation: {
      status: 'declared',
      ownedBy: '0023',
      note: 'What an operator configures an alert from is the console phase’s open gate',
    },
  },
} as const satisfies Record<string, HookDefinition>;

export type ScriptHookId = keyof typeof HOOK_DEFINITIONS;

export const SCRIPT_HOOK_IDS = Object.keys(HOOK_DEFINITIONS) as readonly ScriptHookId[];

export const SCRIPT_HOOKS: readonly ScriptHook[] = SCRIPT_HOOK_IDS.map((id) => ({
  id,
  ...HOOK_DEFINITIONS[id],
}));

const BY_ID = new Map<string, ScriptHook>(SCRIPT_HOOKS.map((hook) => [hook.id, hook]));

export class ScriptHookError extends DomainError {
  readonly code = 'SCRIPT_HOOK_INVALID';
}

/** The hook, or undefined for an identifier the taxonomy does not publish. */
export function findScriptHook(id: string): ScriptHook | undefined {
  return BY_ID.get(id);
}

/**
 * What attaching a script to a hook means today.
 *
 * `inert` is the answer that matters: the hook exists, the attachment is
 * well-formed, and nothing evaluates it yet. Reporting that is the difference
 * between a feature that has not landed and one that silently does nothing.
 */
export interface HookAttachment {
  readonly hook: ScriptHook;
  readonly inert: boolean;
  readonly reason?: string;
}

export function resolveHookAttachment(id: string): Result<HookAttachment, ScriptHookError> {
  const hook = BY_ID.get(id);
  if (!hook) {
    return err(
      new ScriptHookError(
        `Unknown script hook "${id}". Published hooks: ${SCRIPT_HOOK_IDS.join(', ')}`,
        { hook: id },
      ),
    );
  }

  if (hook.evaluation.status === 'declared') {
    const { ownedBy, note } = hook.evaluation;
    return ok({
      hook,
      inert: true,
      reason:
        `Hook "${hook.id}" is declared but nothing evaluates it yet; it lands with phase ${ownedBy}` +
        (note ? `. ${note}` : ''),
    });
  }

  return ok({ hook, inert: false });
}

/** The contract a script author reads instead of guessing (task 1.6). */
export function publishedContextPaths(id: ScriptHookId): readonly string[] {
  return HOOK_DEFINITIONS[id].context;
}

/**
 * Whether a hook publishes a path a script wants to read.
 *
 * Two placeholders keep the published list finite: `N` matches one array index,
 * so `score.sides.N.value` covers an eight-lane heat and a duel alike, and a
 * trailing `*` matches any subtree, which is how a caller-shaped context states
 * that it guarantees nothing finer.
 */
export function publishesPath(hook: ScriptHook, path: string): boolean {
  const segments = path.split('.');
  return hook.context.some((published) => matches(published.split('.'), segments));
}

function matches(published: readonly string[], requested: readonly string[]): boolean {
  for (let index = 0; index < published.length; index += 1) {
    const expected = published[index];
    // A trailing `*` publishes a subtree; one in the middle stands for a single
    // key nobody can enumerate in advance — a collector code — and what follows
    // it still has to match, so `collectors.*.total` publishes the total and not
    // whatever else a caller decides to hang there.
    if (expected === '*' && index === published.length - 1) return true;

    const actual = requested[index];
    if (actual === undefined) return false;
    if (expected === '*') continue;
    if (expected === 'N') {
      if (!/^\d+$/.test(actual)) return false;
      continue;
    }
    if (expected !== actual) return false;
  }
  // A published leaf covers itself and anything under it: reading
  // `event.payload` whole is as legitimate as reading one of its fields.
  return true;
}

/**
 * Refuses a context carrying anything but data.
 *
 * The context is cloned, serialized into the evaluation record and replayed
 * from there. `structuredClone` throws on a function and `JSON.stringify`
 * silently drops one, which is worse — so the check is explicit and runs before
 * either does.
 */
export function assertDataOnlyContext(
  context: Readonly<Record<string, unknown>>,
): Result<true, ScriptHookError> {
  const offender = findNonData(context, '');
  if (offender) {
    return err(
      new ScriptHookError(
        `Hook context carries a ${offender.kind} at "${offender.path}"; a context holds data only, ` +
          'because it is cloned, stored with the evaluation and replayed from there',
        { path: offender.path, kind: offender.kind },
      ),
    );
  }
  return ok(true);
}

function findNonData(
  value: unknown,
  path: string,
  seen = new Set<unknown>(),
): { readonly path: string; readonly kind: string } | undefined {
  if (typeof value === 'function') return { path, kind: 'function' };
  if (typeof value === 'symbol') return { path, kind: 'symbol' };
  if (typeof value !== 'object' || value === null) return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const offender = findNonData(nested, path === '' ? key : `${path}.${key}`, seen);
    if (offender) return offender;
  }
  return undefined;
}
