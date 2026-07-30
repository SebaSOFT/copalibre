import { withTransaction } from '../transaction';
import { AuditReader } from '../audit';
import { OutboxReader } from '../outbox';
import { OrganizationRepository } from './organization-repository';
import { InvariantViolationError } from '../errors';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database';

/**
 * The core guarantee of this phase: domain mutation, audit record, and outbox
 * event commit together or not at all.
 */
describe('transaction boundary (integration)', () => {
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('txn');
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('commits domain mutation + audit + outbox atomically', async () => {
    const repository = new OrganizationRepository(scratch.db);
    const organization = await withTransaction(scratch.db, (uow) =>
      repository.create(uow, {
        alias: 'club-atlas',
        name: 'Club Atlas',
        actor: 'user:admin-1',
        authorizationContext: 'scope:organization.write',
      }),
    );

    expect(organization.alias).toBe('club-atlas');
    await expect(repository.findByAlias('club-atlas')).resolves.toMatchObject({
      organizationId: organization.organizationId,
    });

    const audit = await new AuditReader(scratch.db).historyFor(
      'organization',
      organization.organizationId,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'organization.created',
      actor: 'user:admin-1',
      authorizationContext: 'scope:organization.write',
    });

    const outbox = await new OutboxReader(scratch.db).pending();
    expect(outbox.map((event) => event.eventType)).toContain('organization.created');
  });

  it('rolls back the domain row, the audit row, and the outbox row together', async () => {
    const repository = new OrganizationRepository(scratch.db);
    const outboxReader = new OutboxReader(scratch.db);
    const before = (await outboxReader.pending(1000)).length;

    await expect(
      withTransaction(scratch.db, async (uow) => {
        await repository.create(uow, {
          alias: 'doomed-org',
          name: 'Doomed',
          actor: 'user:admin-1',
          authorizationContext: 'scope:organization.write',
        });
        throw new Error('failure after the writes');
      }),
    ).rejects.toThrow('failure after the writes');

    await expect(repository.findByAlias('doomed-org')).resolves.toBeUndefined();

    const auditRows = await scratch.db
      .selectFrom('audit_log')
      .selectAll()
      .where('action', '=', 'organization.created')
      .execute();
    expect(auditRows.every((row) => row.reason === null)).toBe(true);
    // Only the successfully committed organization's audit row exists.
    expect(auditRows).toHaveLength(1);

    expect(await outboxReader.pending(1000)).toHaveLength(before);
  });

  it('rejects a domain-invariant violation before issuing any SQL', async () => {
    const repository = new OrganizationRepository(scratch.db);
    const countBefore = await scratch.db
      .selectFrom('organizations')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();

    await expect(
      withTransaction(scratch.db, (uow) =>
        repository.create(uow, {
          // Uppercase + spaces: rejected by the domain Alias value object.
          alias: 'Not A Valid Alias',
          name: 'Invalid',
          actor: 'user:admin-1',
          authorizationContext: 'scope:organization.write',
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);

    const countAfter = await scratch.db
      .selectFrom('organizations')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    expect(countAfter.count).toBe(countBefore.count);
  });

  it('returns audit history in chronological order with actor and timestamp', async () => {
    const repository = new OrganizationRepository(scratch.db);
    const organization = await withTransaction(scratch.db, (uow) =>
      repository.create(uow, {
        alias: 'history-org',
        name: 'History',
        actor: 'user:creator',
        authorizationContext: 'scope:organization.write',
      }),
    );

    // Two further audited actions on the same aggregate.
    for (const actor of ['user:editor-1', 'user:editor-2']) {
      await withTransaction(scratch.db, (uow) =>
        uow.recordAudit({
          organizationId: organization.organizationId,
          entityType: 'organization',
          entityId: organization.organizationId,
          action: 'organization.renamed',
          actor,
          authorizationContext: 'scope:organization.write',
          previousState: { name: 'History' },
          resultingState: { name: `History by ${actor}` },
          reason: 'operator rename',
        }),
      );
    }

    const history = await new AuditReader(scratch.db).historyFor(
      'organization',
      organization.organizationId,
    );
    expect(history).toHaveLength(3);
    expect(history.map((entry) => entry.actor)).toEqual([
      'user:creator',
      'user:editor-1',
      'user:editor-2',
    ]);
    const timestamps = history.map((entry) => Date.parse(entry.occurredAt));
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
    expect(history[1]).toMatchObject({
      previousState: { name: 'History' },
      reason: 'operator rename',
    });
  });
});
