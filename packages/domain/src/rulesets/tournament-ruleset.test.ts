import { validateHookScriptAttachment, type HookScriptAttachment } from './tournament-ruleset.js';

describe('validateHookScriptAttachment', () => {
  it('accepts a hook attachment for a published hook', () => {
    const attachment: HookScriptAttachment = {
      hook: 'event.recorded',
      script: { id: 'test-rule', rules: [] },
      description: 'Notify when red card occurs',
    };
    const result = validateHookScriptAttachment(attachment);
    expect(result.ok).toBe(true);
  });

  it('rejects an unpublished hook and reports unknown hook', () => {
    const attachment: HookScriptAttachment = {
      hook: 'unheard.hook',
      script: { id: 'test-rule', rules: [] },
    };
    const result = validateHookScriptAttachment(attachment);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCRIPT_HOOK_INVALID');
      expect(result.error.message).toContain('Unknown script hook');
    }
  });

  it('rejects a published hook that this tournament surface does not evaluate', () => {
    const result = validateHookScriptAttachment({
      hook: 'match.started',
      script: { id: 'test-rule', rules: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Unsupported tournament custom-script hook');
      expect(result.error.message).toContain('event.recorded');
    }
  });
});
