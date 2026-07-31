import {
  assertDataOnlyContext,
  ENVIRONMENT_CONTEXT_PATHS,
  findScriptHook,
  publishedContextPaths,
  publishesPath,
  resolveHookAttachment,
  SCRIPT_HOOK_IDS,
  SCRIPT_HOOKS,
  type ScriptHookId,
} from './script-hooks.js';

const LIFECYCLE_HOOKS: readonly ScriptHookId[] = [
  'match.started',
  'match.paused',
  'match.resumed',
  'match.finished',
  'segment.started',
  'segment.paused',
  'segment.finished',
  'score.changed',
  'event.recorded',
  'stage.started',
  'stage.finished',
  'alert.raised',
];

describe('the taxonomy', () => {
  it.each(LIFECYCLE_HOOKS)('names the %s moment', (hook) => {
    expect(SCRIPT_HOOK_IDS).toContain(hook);
  });

  it("keeps 0010's identifiers, so declared constraints are unaffected", () => {
    expect(SCRIPT_HOOK_IDS).toEqual(
      expect.arrayContaining([
        'draw.assign-group',
        'draw.pair-round',
        'seed.order',
        'schedule.assign-slot',
        'entrant.eligibility',
        'stage.advance',
      ]),
    );
  });

  it('publishes the environment at every hook, so no rule reaches outside its context', () => {
    for (const hook of SCRIPT_HOOKS) {
      expect(hook.context).toEqual(expect.arrayContaining([...ENVIRONMENT_CONTEXT_PATHS]));
    }
  });

  it('denies by default only where silence must not authorise', () => {
    const denying = SCRIPT_HOOKS.filter((hook) => hook.polarity === 'default-deny').map(
      (hook) => hook.id,
    );

    expect(denying).toEqual(['entrant.eligibility', 'stage.advance']);
  });

  it('names the phase that owns every hook nothing evaluates yet', () => {
    for (const hook of SCRIPT_HOOKS) {
      if (hook.evaluation.status === 'declared') {
        expect(hook.evaluation.ownedBy).toMatch(/^\d{4}$/);
      }
    }
  });
});

describe('resolveHookAttachment', () => {
  it('refuses an unknown hook naming the published ones', () => {
    const result = resolveHookAttachment('match.vibes');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SCRIPT_HOOK_INVALID');
    expect(result.error.message).toContain('match.started');
  });

  it('accepts an attachment to an evaluated hook as live', () => {
    const result = resolveHookAttachment('draw.assign-group');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inert).toBe(false);
  });

  it('reports an attachment to a declared-but-unevaluated hook as inert', () => {
    const result = resolveHookAttachment('match.started');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inert).toBe(true);
    expect(result.value.reason).toContain('0014');
  });

  it('says why the scheduling hook is inert despite 0012 having shipped', () => {
    const result = resolveHookAttachment('schedule.assign-slot');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reason).toContain('natively');
  });
});

describe('the published context', () => {
  it('carries each side and its score at any arity', () => {
    const hook = findScriptHook('score.changed');

    expect(hook).toBeDefined();
    if (!hook) return;
    expect(publishesPath(hook, 'score.sides.0.value')).toBe(true);
    expect(publishesPath(hook, 'score.sides.7.entrantId')).toBe(true);
    expect(publishesPath(hook, 'score.sides.first.value')).toBe(false);
  });

  it('carries home advantage per side, and the derived pair a rule can compare', () => {
    const hook = findScriptHook('score.changed');
    if (!hook) throw new Error('score.changed is not published');

    expect(publishesPath(hook, 'score.sides.1.home')).toBe(true);
    expect(publishesPath(hook, 'score.home')).toBe(true);
    expect(publishesPath(hook, 'score.away')).toBe(true);
  });

  it('states what changed, not only the new score', () => {
    expect(publishedContextPaths('score.changed')).toEqual(
      expect.arrayContaining([
        'score.previous',
        'score.current',
        'score.leaderChanged',
        'score.decisive',
      ]),
    );
  });

  it('states why a pause happened, at both pause hooks', () => {
    for (const hook of ['match.paused', 'segment.paused'] as const) {
      expect(publishedContextPaths(hook)).toEqual(
        expect.arrayContaining(['pause.kind', 'pause.reason']),
      );
    }
  });

  it('refuses a path the hook does not publish', () => {
    const hook = findScriptHook('stage.started');
    if (!hook) throw new Error('stage.started is not published');

    expect(publishesPath(hook, 'match.sides.0.value')).toBe(false);
    expect(publishesPath(hook, 'stage.status')).toBe(true);
  });

  it('covers a subtree where the context is caller-shaped', () => {
    const hook = findScriptHook('draw.assign-group');
    if (!hook) throw new Error('draw.assign-group is not published');

    expect(publishesPath(hook, 'draw.entrants.3.region')).toBe(true);
  });

  it('publishes the evaluation instant and the zone a calendar rule needs, as data', () => {
    expect(publishedContextPaths('match.started')).toEqual(
      expect.arrayContaining(['match.startedAt', 'now', 'tournament.timeZone']),
    );
  });
});

describe('assertDataOnlyContext', () => {
  it('accepts a context of plain data', () => {
    const result = assertDataOnlyContext({
      now: 1_770_000_000_000,
      match: { id: 'm-1', sides: [{ entrantId: 'e-1', value: 2, home: null }] },
    });

    expect(result.ok).toBe(true);
  });

  it('refuses a context carrying a function, naming where it is', () => {
    const result = assertDataOnlyContext({
      match: { id: 'm-1' },
      helpers: { now: () => 1 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({ path: 'helpers.now', kind: 'function' });
  });

  it('survives a cyclic context rather than recursing forever', () => {
    const cyclic: Record<string, unknown> = { id: 'm-1' };
    cyclic.self = cyclic;

    expect(assertDataOnlyContext(cyclic).ok).toBe(true);
  });
});
