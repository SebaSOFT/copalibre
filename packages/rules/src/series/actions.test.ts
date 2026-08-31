import { createDefaultRulesRegistry, createHookScriptRegistry, WinSeriesAction } from '../index.js';
import { findScriptHook, SCRIPT_HOOK_IDS } from '@copalibre/domain';
import type { ExecutionContext } from '@sebasoft/neuron-js';

describe('WinSeriesAction & series resolution hook', () => {
  it('publishes series.resolved in the hook taxonomy', () => {
    expect(SCRIPT_HOOK_IDS).toContain('series.resolved');
    const hook = findScriptHook('series.resolved');
    expect(hook).toBeDefined();
    expect(hook?.polarity).toBe('permissive');
    expect(hook?.evaluation.status).toBe('evaluated');
    expect(hook?.context).toContain('series.span');
    expect(hook?.context).toContain('series.neutralGround');
  });

  it('registers winSeries in the default and hook script registries', () => {
    const defaultRegistry = createDefaultRulesRegistry();
    expect(defaultRegistry.has('action', 'winSeries')).toBe(true);

    const hookRegistry = createHookScriptRegistry();
    expect(hookRegistry.has('action', 'winSeries')).toBe(true);

    const entry = hookRegistry.list().find((e) => e.kind === 'action' && e.type === 'winSeries');
    expect(entry).toBeDefined();
    expect(entry?.description).toContain('Declares the winning entrant');
  });

  it('executes WinSeriesAction and writes seriesResolution into execution state', () => {
    const registry = createDefaultRulesRegistry();
    const action = new WinSeriesAction(
      'a1',
      'winSeries',
      [
        { id: 'w1', name: 'winner', type: 'simple_string', value: 'ent-winner', options: {} },
        { id: 'r1', name: 'reason', type: 'simple_string', value: 'Points lead', options: {} },
      ],
      {},
      registry.getNeuron(),
    );

    const initialContext: ExecutionContext = {
      state: {},
      messages: [],
    };

    const result = action.execute(initialContext);
    expect(result.isSuccessful()).toBe(true);
    expect(result.value).toBe('ent-winner');
    expect(
      (result.context.state as { seriesResolution?: { status: string; winnerEntrantId: string } })
        .seriesResolution,
    ).toEqual({
      status: 'decided',
      winnerEntrantId: 'ent-winner',
      reason: 'Points lead',
    });
  });

  it('fails WinSeriesAction if required parameters are missing', () => {
    const registry = createDefaultRulesRegistry();
    const action = new WinSeriesAction('a1', 'winSeries', [], {}, registry.getNeuron());

    const initialContext: ExecutionContext = {
      state: {},
      messages: [],
    };

    const result = action.execute(initialContext);
    expect(result.isSuccessful()).toBe(false);
  });
});
