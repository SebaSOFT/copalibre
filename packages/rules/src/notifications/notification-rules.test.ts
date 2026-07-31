import type { DisciplineDescriptor, RecordedEvent } from '@copalibre/domain';
import { expectGolden } from '../test-support/golden.js';
import {
  dedupeNotifications,
  evaluateNotificationRule,
  notificationRulesFrom,
  type NotificationRule,
} from './notification-rules.js';

const descriptor = {
  descriptorId: 'd-1',
  name: 'Orbital Field',
  eventDefinitions: [
    { code: 'infraction', category: 'negative' },
    { code: 'strike', category: 'positive' },
  ],
} as unknown as DisciplineDescriptor;

/** Two entrants, named the way a stored outcome names them. */
const HOME = 'entrant-atlas';
const AWAY = 'entrant-boca';

function infraction(sequence: number, side: string): RecordedEvent {
  return {
    eventId: `e-${sequence}`,
    matchId: 'm-1',
    segmentId: 'seg-1',
    definitionCode: 'infraction',
    occurredAt: `2026-07-29T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    sequence,
    side,
    payload: {},
  };
}

const teamInfractionsRule: NotificationRule = {
  id: 'team-infraction-threshold',
  version: 3,
  scope: 'side',
  predicate: { definitionCodes: ['infraction'] },
  aggregation: { kind: 'count' },
  threshold: { comparator: '>=', value: 3 },
  semantics: { kind: 'threshold-crossing' },
  action: {
    severity: 'warning',
    titleTemplate: 'Infraction limit reached',
    messageTemplate: '{{aggregate}} infractions for {{side}} — free hit for the opponent',
    targetRole: 'table-official',
  },
};

describe('evaluateNotificationRule', () => {
  it('does not fire below the threshold', () => {
    const events = [infraction(1, HOME), infraction(2, HOME)];
    const evaluation = evaluateNotificationRule(teamInfractionsRule, descriptor, events);
    expect(evaluation.instances).toHaveLength(0);
  });

  it('fires exactly once at the crossing, scoped per side', () => {
    const events = [
      infraction(1, HOME),
      infraction(2, AWAY),
      infraction(3, HOME),
      infraction(4, HOME), // home crosses 3 here
      infraction(5, HOME), // beyond threshold: crossing already fired
    ];
    const evaluation = evaluateNotificationRule(teamInfractionsRule, descriptor, events);
    expect(evaluation.instances).toHaveLength(1);
    const [instance] = evaluation.instances;
    expect(instance).toMatchObject({
      scopeKey: `match:m-1/side:${HOME}`,
      triggeredByEventId: 'e-4',
      severity: 'warning',
      message: `3 infractions for ${HOME} — free hit for the opponent`,
    });
    expectGolden('notification-threshold-crossing', evaluation);
  });

  it('recomputation over the same log yields identical identity keys (idempotent delivery)', () => {
    const events = [infraction(1, HOME), infraction(2, HOME), infraction(3, HOME)];
    const first = evaluateNotificationRule(teamInfractionsRule, descriptor, events);
    const second = evaluateNotificationRule(teamInfractionsRule, descriptor, events);
    expect(first.instances.map((i) => i.identityKey)).toEqual(
      second.instances.map((i) => i.identityKey),
    );

    // Simulated reconnect: keys already delivered are filtered out entirely.
    const delivered = new Set(first.instances.map((i) => i.identityKey));
    expect(dedupeNotifications(delivered, second.instances)).toHaveLength(0);
  });

  it('every-qualifying-event fires on each qualifying event once at/over threshold', () => {
    const rule: NotificationRule = {
      ...teamInfractionsRule,
      semantics: { kind: 'every-qualifying-event' },
    };
    const events = [
      infraction(1, HOME),
      infraction(2, HOME),
      infraction(3, HOME),
      infraction(4, HOME),
    ];
    const evaluation = evaluateNotificationRule(rule, descriptor, events);
    expect(evaluation.instances.map((i) => i.triggeredByEventId)).toEqual(['e-3', 'e-4']);
    // Distinct identity per firing — still deterministic.
    expect(new Set(evaluation.instances.map((i) => i.identityKey)).size).toBe(2);
  });

  it('bounded-repeat honors maxFirings and cooldown', () => {
    const rule: NotificationRule = {
      ...teamInfractionsRule,
      semantics: { kind: 'bounded-repeat', maxFirings: 2, cooldownEvents: 1 },
    };
    const events = [1, 2, 3, 4, 5, 6, 7].map((n) => infraction(n, HOME));
    const evaluation = evaluateNotificationRule(rule, descriptor, events);
    // Crosses at e-3 (fires #1), e-4 in cooldown, e-5 fires #2, then capped.
    expect(evaluation.instances.map((i) => i.triggeredByEventId)).toEqual(['e-3', 'e-5']);
  });

  it('sum aggregation adds a payload field instead of counting', () => {
    const rule: NotificationRule = {
      ...teamInfractionsRule,
      aggregation: { kind: 'sum', payloadField: 'penaltySeconds' },
      threshold: { comparator: '>=', value: 120 },
    };
    const events: RecordedEvent[] = [
      { ...infraction(1, HOME), payload: { penaltySeconds: 60 } },
      { ...infraction(2, HOME), payload: { penaltySeconds: 60 } },
    ];
    const evaluation = evaluateNotificationRule(rule, descriptor, events);
    expect(evaluation.instances).toHaveLength(1);
    expect(evaluation.instances[0]?.contextValues.aggregate).toBe(120);
  });

  it('category predicate filters through the descriptor', () => {
    const rule: NotificationRule = {
      ...teamInfractionsRule,
      predicate: { categories: ['negative'] },
      threshold: { comparator: '>=', value: 1 },
    };
    const positive: RecordedEvent = { ...infraction(1, HOME), definitionCode: 'strike' };
    const negative = infraction(2, HOME);
    const evaluation = evaluateNotificationRule(rule, descriptor, [positive, negative]);
    expect(evaluation.instances).toHaveLength(1);
    expect(evaluation.instances[0]?.triggeredByEventId).toBe('e-2');
  });

  it('leaves unknown template placeholders visible instead of failing silently', () => {
    const rule: NotificationRule = {
      ...teamInfractionsRule,
      threshold: { comparator: '>=', value: 1 },
      action: { ...teamInfractionsRule.action, messageTemplate: '{{missingKey}} happened' },
    };
    const evaluation = evaluateNotificationRule(rule, descriptor, [infraction(1, HOME)]);
    expect(evaluation.instances[0]?.message).toBe('{{missingKey}} happened');
  });

  it('produces an auditable evaluation record listing fired identity keys', () => {
    const events = [infraction(1, HOME), infraction(2, HOME), infraction(3, HOME)];
    const evaluation = evaluateNotificationRule(teamInfractionsRule, descriptor, events);
    expect(evaluation.record).toMatchObject({
      engine: 'copalibre-rules',
      ruleVersion: { id: 'team-infraction-threshold', version: 3 },
      output: [`team-infraction-threshold@v3|match:m-1/side:${HOME}|firing:1`],
    });
    expect(evaluation.record.trace[0]).toMatchObject({ kind: 'threshold', outcome: 'fired' });
  });
});

describe('notificationRulesFrom', () => {
  const rule = {
    id: 'team-infraction-threshold',
    version: 3,
    scope: 'side',
    predicate: { definitionCodes: ['infraction'] },
    aggregation: { kind: 'count' },
    threshold: { comparator: '>=', value: 3 },
    semantics: { kind: 'threshold-crossing' },
    action: {
      severity: 'warning',
      titleTemplate: 'Infraction limit reached',
      messageTemplate: '{{aggregate}} infractions',
      targetRole: 'table-official',
    },
  };

  it('reads the rules a compiled ruleset configures', () => {
    expect(notificationRulesFrom({ notificationRules: [rule] })).toEqual([rule]);
  });

  it.each([
    ['no config at all', undefined],
    ['a config that is not an object', 'notificationRules'],
    ['a config declaring none', {}],
    ['a declaration that is not a list', { notificationRules: {} }],
  ])('reads nothing from %s', (_label, config) => {
    expect(notificationRulesFrom(config)).toEqual([]);
  });

  it('skips a malformed rule rather than stopping the match being operated', () => {
    const config = {
      notificationRules: [rule, { id: 'half-written', version: 1 }, null, 'nonsense'],
    };

    expect(notificationRulesFrom(config)).toEqual([rule]);
  });
});
