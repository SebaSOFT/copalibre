import type { HookScriptAttachment, RecordedEvent } from '@copalibre/domain';
import { runEventRecordedCustomScripts } from './event-recorded.js';

const EVENT: RecordedEvent = {
  eventId: '01992ce8-4c00-7000-8000-000000000001',
  matchId: '01992ce8-4c00-7000-8000-000000000002',
  segmentId: '01992ce8-4c00-7000-8000-000000000003',
  definitionCode: 'goal',
  occurredAt: '2026-08-24T12:00:00.000Z',
  sequence: 4,
  side: '01992ce8-4c00-7000-8000-000000000004',
  payload: { value: 1 },
};

function attachment(actionType = 'notify'): HookScriptAttachment {
  return {
    hook: 'event.recorded',
    script: {
      id: `script-${actionType}`,
      rules: [
        {
          id: 'always',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [
            {
              id: 'effect',
              type: actionType,
              options: {},
              params: [
                {
                  id: 'title',
                  name: 'title',
                  type: 'simple_string',
                  value: 'Goal',
                  options: {},
                },
                {
                  id: 'message',
                  name: 'message',
                  type: 'simple_string',
                  value: 'Recorded',
                  options: {},
                },
              ],
            },
          ],
        },
      ],
    },
  } as HookScriptAttachment;
}

describe('runEventRecordedCustomScripts', () => {
  it('selects event.recorded attachments and returns deterministic effects', () => {
    const input = {
      attachments: [attachment(), { ...attachment(), hook: 'stage.finished' }],
      rulesetVersion: 2,
      event: EVENT,
      eventCategory: 'positive',
      context: { now: Date.parse(EVENT.occurredAt) },
    };

    const first = runEventRecordedCustomScripts(input);
    const replay = runEventRecordedCustomScripts(input);

    expect(first.failures).toEqual([]);
    expect(first.effects).toHaveLength(1);
    expect(replay.effects).toEqual(first.effects);
    expect(first.effects[0]?.identityKey).toContain(EVENT.eventId);
  });

  it('returns a named failure and no partial effect for a failing script', () => {
    const result = runEventRecordedCustomScripts({
      attachments: [attachment('set-guard-outcome')],
      rulesetVersion: 2,
      event: EVENT,
      context: { now: Date.parse(EVENT.occurredAt) },
    });

    expect(result.effects).toEqual([]);
    expect(result.failures).toEqual([
      expect.objectContaining({
        hook: 'event.recorded',
        scriptId: 'script-set-guard-outcome',
        causeId: EVENT.eventId,
        code: 'RULE_SCRIPT_INVALID',
      }),
    ]);
  });
});
