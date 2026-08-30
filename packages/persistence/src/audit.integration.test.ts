import { AuditReader, isRefusal } from './audit.js';
import { recordAuditRefusal, withTransaction } from './transaction.js';
import { createMigratedDatabase, type ScratchDatabase } from './test-support/scratch-database.js';
import { OrganizationRepository } from './repositories/organization-repository.js';

describe('AuditReader — organization/actor-scoped pagination (task 4.1)', () => {
  let scratch: ScratchDatabase;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('audit-reader');
    const repository = new OrganizationRepository(scratch.db);

    orgA = (
      await withTransaction(scratch.db, (uow) =>
        repository.create(uow, {
          alias: 'liga-a',
          name: 'Liga A',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      )
    ).organizationId;
    orgB = (
      await withTransaction(scratch.db, (uow) =>
        repository.create(uow, {
          alias: 'liga-b',
          name: 'Liga B',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      )
    ).organizationId;

    // orgA gets five further audited actions from two different actors;
    // orgB gets one — proof that a reader scoped to orgA never sees it.
    for (let i = 0; i < 5; i += 1) {
      await withTransaction(scratch.db, (uow) =>
        uow.recordAudit({
          organizationId: orgA,
          entityType: 'organization',
          entityId: orgA,
          action: 'organization.settings_updated',
          actor: i % 2 === 0 ? 'user:alice' : 'user:bob',
          authorizationContext: 'copalibre.control',
        }),
      );
    }
    await withTransaction(scratch.db, (uow) =>
      uow.recordAudit({
        organizationId: orgB,
        entityType: 'organization',
        entityId: orgB,
        action: 'organization.settings_updated',
        actor: 'user:alice',
        authorizationContext: 'copalibre.control',
      }),
    );
  });

  afterAll(async () => {
    await scratch.drop();
  });

  it('scopes forOrganization to the requested organization and reports the true total', async () => {
    const page = await new AuditReader(scratch.db).forOrganization(orgA, { limit: 100, offset: 0 });
    // +1 for orgA's own `organization.created` entry.
    expect(page.total).toBe(6);
    expect(page.records.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('is readable a page at a time without loading the trail whole', async () => {
    const reader = new AuditReader(scratch.db);
    const first = await reader.forOrganization(orgA, { limit: 2, offset: 0 });
    const second = await reader.forOrganization(orgA, { limit: 2, offset: 2 });

    expect(first.records).toHaveLength(2);
    expect(second.records).toHaveLength(2);
    expect(first.total).toBe(second.total);
    // Newest first, and no overlap between pages.
    const firstIds = first.records.map((r) => r.auditId);
    const secondIds = second.records.map((r) => r.auditId);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it('scopes forActor to one actor within one organization', async () => {
    const page = await new AuditReader(scratch.db).forActor(orgA, 'user:alice', {
      limit: 100,
      offset: 0,
    });
    expect(page.total).toBe(3);
    expect(page.records.every((r) => r.actor === 'user:alice' && r.organizationId === orgA)).toBe(
      true,
    );
  });
});

describe('AuditReader.historyFor — a refused attempt alongside applied changes (task 6.4)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('audit-reader-history');
    organizationId = (
      await withTransaction(scratch.db, (uow) =>
        new OrganizationRepository(scratch.db).create(uow, {
          alias: 'liga-history',
          name: 'Liga History',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      )
    ).organizationId;

    // The same aggregate: one applied change, then a refused attempt.
    await withTransaction(scratch.db, (uow) =>
      uow.recordAudit({
        organizationId,
        entityType: 'organization',
        entityId: organizationId,
        action: 'organization.settings_updated',
        actor: 'user:alice',
        authorizationContext: 'copalibre.control',
        resultingState: { name: 'Liga History Renamed' },
      }),
    );
    await recordAuditRefusal(scratch.db, {
      organizationId,
      entityType: 'organization',
      entityId: organizationId,
      action: 'mutation.refused',
      actor: 'user:bob',
      authorizationContext: 'copalibre.control',
      reason: 'Field "name" is blocked after results',
    });
  });

  afterAll(async () => {
    await scratch.drop();
  });

  it('returns both, and the refused attempt is distinguishable from the applied change', async () => {
    const history = await new AuditReader(scratch.db).historyFor('organization', organizationId);
    // +1 for the organization's own `organization.created` entry.
    expect(history).toHaveLength(3);

    const applied = history.find((entry) => entry.action === 'organization.settings_updated');
    const refused = history.find((entry) => entry.action === 'mutation.refused');
    expect(applied).toBeDefined();
    expect(refused).toBeDefined();
    expect(isRefusal(applied as (typeof history)[number])).toBe(false);
    expect(isRefusal(refused as (typeof history)[number])).toBe(true);
    expect(refused?.reason).toBe('Field "name" is blocked after results');
    expect(refused?.resultingState).toBeUndefined();
  });
});
