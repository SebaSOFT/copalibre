import { AuditReader } from './audit.js';
import { withTransaction } from './transaction.js';
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
