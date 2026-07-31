import {
  dedupeNotifications,
  evaluateAtHook,
  registerCopalibreVocabulary,
  remainingSeconds,
  RulesRegistry,
  toDeclaredTimer,
  toNotificationInstance,
  type DeclaredEffect,
  type HookEvaluationInput,
  type NotificationInstance,
  type RuleScript,
} from '@copalibre/rules';
import {
  newId,
  OrganizationRepository,
  OutboxReader,
  withTransaction,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../persistence/src/test-support/scratch-database.js';

/**
 * Declared effects against real storage.
 *
 * The point of the model is that an effect survives being written down and read
 * back: its identity is stable across two separate evaluations in two separate
 * transactions, its timer keeps the clock it was declared with, and neither
 * reaches the outbox unless the transaction that produced it commits.
 *
 * Delivery itself is not this phase's — `0015-worker-scheduler-async-jobs`
 * relays the outbox. What is proven here is the contract delivery will rely on.
 */

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };
const NOW = 1_770_000_000_000;

/** A stage identifier is a UUIDv7, and so is the occurrence an effect names. */
const STAGE_ID = newId();
const ROLLED_BACK_STAGE_ID = newId();

const alertScript = {
  id: 'lead-alert',
  rules: [
    {
      id: 'comfortable-lead',
      type: 'simple_rule',
      options: {},
      conditions: [],
      actions: [
        {
          id: 'raise',
          type: 'notify',
          options: {},
          params: [
            { id: 'p1', name: 'severity', type: 'simple_string', value: 'warning', options: {} },
            { id: 'p2', name: 'title', type: 'simple_string', value: 'Stage closed', options: {} },
            {
              id: 'p3',
              name: 'message',
              type: 'simple_string',
              value: 'Stage {{ stage.number }} finished',
              options: { expression: true },
            },
          ],
        },
        {
          id: 'countdown',
          type: 'startTimer',
          options: {},
          params: [
            {
              id: 'p4',
              name: 'timerId',
              type: 'simple_string',
              value: 'appeal-window',
              options: {},
            },
            { id: 'p5', name: 'durationSeconds', type: 'simple_number', value: 300, options: {} },
          ],
        },
      ],
    },
  ],
} as unknown as RuleScript;

function evaluation(overrides: Partial<HookEvaluationInput> = {}): HookEvaluationInput {
  return {
    hook: 'stage.finished',
    script: alertScript,
    scriptVersion: 1,
    context: {
      now: NOW,
      stage: { id: STAGE_ID, number: 2, status: 'finished' },
      tournament: { alias: 'copa-cuyo', timeZone: 'America/Argentina/San_Juan' },
    },
    cause: { id: STAGE_ID, at: NOW, scopeKey: `stage:${STAGE_ID}` },
    seed: 7,
    ...overrides,
  };
}

function declare(overrides: Partial<HookEvaluationInput> = {}): readonly DeclaredEffect[] {
  const registry = registerCopalibreVocabulary(new RulesRegistry());
  const decision = evaluateAtHook(registry, evaluation(overrides));
  if (!decision.ok) throw decision.error;
  return decision.value.effects;
}

function declaredOfKind(kind: DeclaredEffect['kind'], overrides = {}): DeclaredEffect {
  const found = declare(overrides).find((effect) => effect.kind === kind);
  if (!found) throw new Error(`the script declared no ${kind}`);
  return found;
}

describe('declared effects against real storage (integration)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('hooks');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'club-atlas',
        name: 'Club Atlas',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function publish(effect: DeclaredEffect): Promise<void> {
    await withTransaction(scratch.db, async (uow) => {
      await uow.publishEvent({
        organizationId,
        stream: `organization/${organizationId}`,
        entityId: effect.origin.causeId,
        eventType: `effect.${effect.kind}`,
        projectionVersion: 1,
        payload: { identityKey: effect.identityKey, ...effect.payload },
      });
    });
  }

  it('delivers one alert for two evaluations of the same occurrence', async () => {
    // A reconnect, a refresh or a recalculation: the same event evaluated
    // twice, in two transactions, minutes apart.
    const first = declaredOfKind('notification');
    const second = declaredOfKind('notification', { seed: 999 });
    await publish(first);
    await publish(second);

    const rows = await new OutboxReader(scratch.db).pending();
    const notifications = rows
      .filter((row) => row.eventType === 'effect.notification')
      .map(
        (row) => toNotificationInstance({ ...first, payload: row.payload }) as NotificationInstance,
      );

    expect(notifications).toHaveLength(2);
    // Two rows, one identity: a delivery log keyed on it raises one alert.
    expect(new Set(notifications.map((instance) => instance.identityKey)).size).toBe(1);
    expect(dedupeNotifications(new Set(), notifications)).toHaveLength(2);

    const delivered = new Set<string>();
    const deliveredOnce = notifications.filter((instance) => {
      if (delivered.has(instance.identityKey)) return false;
      delivered.add(instance.identityKey);
      return true;
    });
    expect(deliveredOnce).toHaveLength(1);
  });

  it('reports decreasing remaining time from one stored record', async () => {
    const timer = declaredOfKind('timer-start');
    await publish(timer);

    const row = (await new OutboxReader(scratch.db).pending()).find(
      (candidate) => candidate.eventType === 'effect.timer-start',
    );
    if (!row) throw new Error('the timer effect never reached the outbox');
    const stored = toDeclaredTimer({ ...timer, payload: row.payload });
    if (!stored) throw new Error('the stored payload is not a declared timer');

    expect(stored.startedAt).toBe(NOW);
    // Two reads, one record: nothing was decremented in storage.
    expect(remainingSeconds(stored, NOW + 60_000)).toBe(240);
    expect(remainingSeconds(stored, NOW + 240_000)).toBe(60);
    expect(remainingSeconds(stored, NOW + 600_000)).toBe(0);
  });

  it('publishes nothing when the transaction that closed the stage rolls back', async () => {
    const before = (await new OutboxReader(scratch.db).pending()).length;
    const effects = declare({ cause: { id: ROLLED_BACK_STAGE_ID, at: NOW } });

    await expect(
      withTransaction(scratch.db, async (uow) => {
        for (const effect of effects) {
          await uow.publishEvent({
            organizationId,
            stream: `organization/${organizationId}`,
            entityId: effect.origin.causeId,
            eventType: `effect.${effect.kind}`,
            projectionVersion: 1,
            payload: { identityKey: effect.identityKey, ...effect.payload },
          });
        }
        // Whatever else closing a stage does fails here.
        throw new Error('stage closure failed after the hook ran');
      }),
    ).rejects.toThrow('stage closure failed');

    const after = await new OutboxReader(scratch.db).pending();
    expect(after).toHaveLength(before);
    expect(after.some((row) => row.entityId === ROLLED_BACK_STAGE_ID)).toBe(false);
  });
});
