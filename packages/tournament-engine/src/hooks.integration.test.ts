import {
  dedupeNotifications,
  evaluateAtHook,
  evaluateNotificationRule,
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
  AuditReader,
  CompetitionRepository,
  newId,
  OrganizationRepository,
  OutboxReader,
  withTransaction,
} from '@copalibre/persistence';
import { fixtureDescriptor, type RecordedEvent, type RecordedOutcome } from '@copalibre/domain';
import { unlockedByFinalization } from './advancement/index.js';
import { generateFixtures } from './fixtures/index.js';
import { isDuelMatch } from './types.js';
import { createMigratedDatabase } from '../../persistence/src/test-support/scratch-database.js';

/**
 * Declared effects against real storage.
 *
 * The point of the model is that an effect survives being written down and read
 * back: its identity is stable across two separate evaluations in two separate
 * transactions, its timer keeps the clock it was declared with, and neither
 * reaches the outbox unless the transaction that produced it commits.
 *
 * Delivery itself is not this phase's — `0017-worker-scheduler-async-jobs`
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

/**
 * Finalization, advancement and alert idempotency against real storage — the
 * three guarantees 0014 makes that only a database can disprove.
 */
describe('finalization and advancement (integration)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let organizationId: string;
  let tournamentId: string;
  let stageNumber = 1;

  const audit = { actor: 'user:referee-1', authorizationContext: 'capability:match.finalize' };

  beforeAll(async () => {
    scratch = await createMigratedDatabase('finalization');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'club-union',
        name: 'Club Unión',
        ...audit,
      }),
    );
    organizationId = organization.organizationId;
    tournamentId = newId();

    await withTransaction(scratch.db, (uow) =>
      uow.tx
        .insertInto('tournaments')
        .values({
          tournament_id: tournamentId,
          organization_id: organizationId,
          alias: 'copa-cuyo',
          name: 'Copa Cuyo',
          descriptor_id: newId(),
          descriptor_version: '1.0.0',
          ruleset_id: null,
          status: 'draft',
          started_at: null,
          profile_id: null,
          profile_version: null,
          created_at: new Date(),
        })
        .execute(),
    );
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function storedMatch(label: string) {
    const competition = new CompetitionRepository(scratch.db);
    return withTransaction(scratch.db, async (uow) => {
      const stage = await competition.createStage(uow, {
        tournamentId,
        number: stageNumber++,
        name: label,
        format: 'single-elimination',
        organizationId,
        ...audit,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...audit,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...audit,
      });
      const segment = await competition.createSegment(uow, {
        matchId: match.matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...audit,
      });
      return { stage, match, segment };
    });
  }

  it('commits the event, its audit row and its outbox effect together, or none of them', async () => {
    const { match, segment } = await storedMatch('recording');
    const competition = new CompetitionRepository(scratch.db);
    const eventId = newId();

    await expect(
      withTransaction(scratch.db, async (uow) => {
        await competition.appendEvent(uow, {
          event: {
            eventId,
            matchId: match.matchId,
            segmentId: segment.segmentId,
            definitionCode: 'strike',
            occurredAt: '2026-07-31T20:00:00.000Z',
            side: newId(),
            payload: { zone: 'inner' },
          },
          sequence: 1,
          organizationId,
          ...audit,
        });
        throw new Error('the command failed after the event was written');
      }),
    ).rejects.toThrow('the command failed');

    // Nothing survives a failed command: not the fact, not its audit trail.
    expect(await competition.listEvents(match.matchId)).toHaveLength(0);
    const history = await new AuditReader(scratch.db).historyFor('match', match.matchId);
    expect(history.some((entry: { action: string }) => entry.action.startsWith('event.'))).toBe(
      false,
    );
  });

  it('records an event with its audit row when the command succeeds', async () => {
    const { match, segment } = await storedMatch('recorded');
    const competition = new CompetitionRepository(scratch.db);
    const side = newId();

    await withTransaction(scratch.db, (uow) =>
      competition.appendEvent(uow, {
        event: {
          eventId: newId(),
          matchId: match.matchId,
          segmentId: segment.segmentId,
          definitionCode: 'strike',
          occurredAt: '2026-07-31T20:05:00.000Z',
          side,
          payload: { zone: 'inner' },
        },
        sequence: 1,
        organizationId,
        ...audit,
      }),
    );

    const stored = await competition.listEvents(match.matchId);
    expect(stored).toHaveLength(1);
    // The side survived storage as the entrant it names, not as a position.
    expect(stored[0]?.side).toBe(side);
  });

  it('never advances the stage itself: a finished stage is available, not taken', async () => {
    const { stage } = await storedMatch('no-auto-advance');
    const competition = new CompetitionRepository(scratch.db);
    const before = await competition.listStages(tournamentId);

    // Finalizing every match of a stage must not create the next one. The cut
    // and the seeding that follows it are decisions — a draw, a weighting, or
    // an operator's hand — and a stage that advanced itself would have made
    // them silently (owner's call, 2026-07-31).
    const closing = await storedMatch('closing');
    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, {
        matchId: closing.match.matchId,
        result: {
          sides: [
            { entrantId: newId(), statistics: { goals: 1 } },
            { entrantId: newId(), statistics: { goals: 0 } },
          ],
          recordedAt: new Date().toISOString(),
        },
        organizationId,
        ...audit,
      }),
    );

    const after = await competition.listStages(tournamentId);
    expect(after.filter((candidate) => candidate.number > stage.number + 1)).toHaveLength(0);
    expect(after.length).toBeGreaterThanOrEqual(before.length);
  });

  it('unlocks the next match of a bracket, computed rather than stored', async () => {
    const bracket = generateFixtures({
      format: 'single-elimination',
      entrants: [1, 2, 3, 4].map((seed) => ({ entrantId: `e${seed}`, seed })),
    });
    if (!bracket.ok) throw bracket.error;

    const semis = bracket.value.matches.filter(isDuelMatch).filter((m) => m.round === 1);
    const [first, second] = semis;
    if (!first || !second) throw new Error('the bracket lost its semi-finals');

    const outcome = (matchId: string, winner: string, loser: string): RecordedOutcome => ({
      matchId,
      winnerEntrantId: winner,
      sides: [
        { entrantId: winner, statistics: { goals: 1 } },
        { entrantId: loser, statistics: { goals: 0 } },
      ],
    });

    // Storing the results changes nothing about how advancement resolves: the
    // database holds fixtures, and the graph is regenerated deterministically.
    const afterFirst = unlockedByFinalization(bracket.value, [], outcome(first.id, 'e1', 'e4'));
    expect(afterFirst).toEqual([]);

    const afterSecond = unlockedByFinalization(
      bracket.value,
      [outcome(first.id, 'e1', 'e4')],
      outcome(second.id, 'e2', 'e3'),
    );
    expect(afterSecond).toHaveLength(1);
  });

  it('raises one alert across a reconnect, however often the log is recomputed', async () => {
    const { match, segment } = await storedMatch('reconnect');
    const competition = new CompetitionRepository(scratch.db);
    const side = newId();

    const rule = {
      id: 'infraction-threshold',
      version: 1,
      scope: 'side' as const,
      predicate: { definitionCodes: ['caution'] },
      aggregation: { kind: 'count' as const },
      threshold: { comparator: '>=' as const, value: 2 },
      semantics: { kind: 'threshold-crossing' as const },
      action: {
        severity: 'warning' as const,
        titleTemplate: 'Infractions',
        messageTemplate: '{{aggregate}} infractions',
        targetRole: 'table-official',
      },
    };

    for (const sequence of [1, 2]) {
      await withTransaction(scratch.db, (uow) =>
        competition.appendEvent(uow, {
          event: {
            eventId: newId(),
            matchId: match.matchId,
            segmentId: segment.segmentId,
            definitionCode: 'caution',
            occurredAt: `2026-07-31T20:0${sequence}:00.000Z`,
            side,
            payload: { reason: 'dissent' },
          },
          sequence,
          organizationId,
          ...audit,
        }),
      );
    }

    // Two consumers recompute the same log — a live console and a reconnecting
    // one — and each publishes only what storage does not already carry.
    for (let pass = 0; pass < 2; pass += 1) {
      const events = (await competition.listEvents(match.matchId)) as readonly RecordedEvent[];
      const already = await competition.publishedNotificationKeys(match.matchId);
      const evaluation = evaluateNotificationRule(rule, fixtureDescriptor(), events);

      await withTransaction(scratch.db, async (uow) => {
        for (const instance of dedupeNotifications(already, evaluation.instances)) {
          await uow.publishEvent({
            organizationId,
            stream: `match:${match.matchId}`,
            entityId: match.matchId,
            eventType: 'notification.raised',
            projectionVersion: 1,
            payload: { ...instance, contextValues: { ...instance.contextValues } },
          });
        }
      });
    }

    const raised = (await new OutboxReader(scratch.db).pending()).filter(
      (row) => row.eventType === 'notification.raised' && row.entityId === match.matchId,
    );
    expect(raised).toHaveLength(1);
  });
});
