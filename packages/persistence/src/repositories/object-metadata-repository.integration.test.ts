import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { ObjectMetadataRepository } from './object-metadata-repository.js';
import { OrganizationRepository } from './organization-repository.js';

const AUDIT = { actor: 'user:admin-1', authorizationContext: 'scope:organization.write' };

describe('ObjectMetadataRepository (integration)', () => {
  let scratch: ScratchDatabase;
  let repo: ObjectMetadataRepository;
  let orgs: OrganizationRepository;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('object-metadata-usage');
    repo = new ObjectMetadataRepository(scratch.db);
    orgs = new OrganizationRepository(scratch.db);

    const orgA = await withTransaction(scratch.db, (uow) =>
      orgs.create(uow, { alias: 'org-alpha', name: 'Organization Alpha', ...AUDIT }),
    );
    orgAId = orgA.organizationId;

    const orgB = await withTransaction(scratch.db, (uow) =>
      orgs.create(uow, { alias: 'org-beta', name: 'Organization Beta', ...AUDIT }),
    );
    orgBId = orgB.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('returns zero bytes and zero objects when an organization has no stored objects', async () => {
    const usage = await repo.usageByOrganization(orgAId);
    expect(usage).toEqual({ totalBytes: 0, objectCount: 0 });
  });

  it('aggregates only passed objects and isolates organizations', async () => {
    // Save 3 objects for orgA: 1 passed, 1 pending, 1 failed
    const passedA1 = await withTransaction(scratch.db, (uow) =>
      repo.save(uow, {
        organizationId: orgAId,
        profile: 'filesystem',
        storageKey: `${orgAId}/asset1.png`,
        contentType: 'image/png',
        sizeBytes: 1024 * 1024 * 5, // 5 MB
        uploadedBy: AUDIT.actor,
      }),
    );
    await repo.markPassed(passedA1.objectId);

    await withTransaction(scratch.db, (uow) =>
      repo.save(uow, {
        organizationId: orgAId,
        profile: 'filesystem',
        storageKey: `${orgAId}/asset2.png`,
        contentType: 'image/png',
        sizeBytes: 1024 * 1024 * 10, // 10 MB
        uploadedBy: AUDIT.actor,
      }),
    );
    // left pending

    const failedA = await withTransaction(scratch.db, (uow) =>
      repo.save(uow, {
        organizationId: orgAId,
        profile: 'filesystem',
        storageKey: `${orgAId}/asset3.png`,
        contentType: 'image/png',
        sizeBytes: 1024 * 1024 * 20, // 20 MB
        uploadedBy: AUDIT.actor,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      repo.markFailed(uow, failedA.objectId, 'malware detected', {
        organizationId: orgAId,
        ...AUDIT,
      }),
    );

    const passedA2 = await withTransaction(scratch.db, (uow) =>
      repo.save(uow, {
        organizationId: orgAId,
        profile: 'filesystem',
        storageKey: `${orgAId}/asset4.png`,
        contentType: 'image/png',
        sizeBytes: 1024 * 1024 * 15, // 15 MB
        uploadedBy: AUDIT.actor,
      }),
    );
    await repo.markPassed(passedA2.objectId);

    // Save 1 passed object for orgB
    const passedB1 = await withTransaction(scratch.db, (uow) =>
      repo.save(uow, {
        organizationId: orgBId,
        profile: 'filesystem',
        storageKey: `${orgBId}/assetB.png`,
        contentType: 'image/png',
        sizeBytes: 1024 * 1024 * 50, // 50 MB
        uploadedBy: AUDIT.actor,
      }),
    );
    await repo.markPassed(passedB1.objectId);

    // Verify orgA usage: only passedA1 (5MB) + passedA2 (15MB) = 20MB (20971520 bytes), count = 2
    const usageA = await repo.usageByOrganization(orgAId);
    expect(usageA).toEqual({
      totalBytes: 20 * 1024 * 1024,
      objectCount: 2,
    });

    // Verify orgB usage: only passedB1 (50MB), count = 1
    const usageB = await repo.usageByOrganization(orgBId);
    expect(usageB).toEqual({
      totalBytes: 50 * 1024 * 1024,
      objectCount: 1,
    });
  });
});
