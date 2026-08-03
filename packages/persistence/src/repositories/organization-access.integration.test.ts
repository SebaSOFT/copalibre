import { createHash } from 'node:crypto';
import {
  AuditReader,
  OrganizationAccessRepository,
  OrganizationRepository,
  withTransaction,
} from '../index.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';

describe('organization invitation acceptance (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('organization-access');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-acceso',
        name: 'Liga Acceso',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => scratch.drop());

  it('provisions exactly the invited role and status through a verified OIDC email', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    const bootstrapToken = 'bootstrap-token';
    await withTransaction(scratch.db, (uow) =>
      access.createInvitation(uow, {
        organizationId,
        recipientEmail: 'admin@example.test',
        role: 'admin',
        status: 'active',
        token: bootstrapToken,
        tokenHash: hash(bootstrapToken),
        expiresAt: '2099-08-04T00:00:00.000Z',
        actor: 'user:super-admin',
        authorizationContext: 'copalibre.super-admin',
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      access.acceptInvitation(uow, {
        tokenHash: hash(bootstrapToken),
        subjectId: 'oidc-admin',
        verifiedEmail: 'ADMIN@example.test',
        name: 'Admin User',
        actor: 'user:oidc-admin',
        authorizationContext: 'copalibre.invite.accept',
      }),
    );

    const refereeToken = 'referee-token';
    await withTransaction(scratch.db, (uow) =>
      access.createInvitation(uow, {
        organizationId,
        recipientEmail: 'referee@example.test',
        role: 'referee',
        status: 'inactive',
        token: refereeToken,
        tokenHash: hash(refereeToken),
        expiresAt: '2099-08-04T00:00:00.000Z',
        actor: 'user:oidc-admin',
        authorizationContext: 'copalibre.control',
      }),
    );
    const assignment = await withTransaction(scratch.db, (uow) =>
      access.acceptInvitation(uow, {
        tokenHash: hash(refereeToken),
        subjectId: 'oidc-referee',
        verifiedEmail: 'referee@example.test',
        picture: 'https://idp.example/referee.png',
        actor: 'user:oidc-referee',
        authorizationContext: 'copalibre.invite.accept',
      }),
    );

    expect(assignment).toMatchObject({
      organizationId,
      role: 'referee',
      status: 'inactive',
      principalId: expect.stringMatching(/-7/),
    });
    expect(await access.findAssignment(organizationId, assignment.principalId)).toEqual(assignment);
  });

  it('rejects a different verified email without consuming the invitation', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    const token = 'wrong-recipient-token';
    await withTransaction(scratch.db, (uow) =>
      access.createInvitation(uow, {
        organizationId,
        recipientEmail: 'viewer@example.test',
        role: 'viewer',
        status: 'active',
        token,
        tokenHash: hash(token),
        expiresAt: '2099-08-04T00:00:00.000Z',
        actor: 'user:oidc-admin',
        authorizationContext: 'copalibre.control',
      }),
    );

    await expect(
      withTransaction(scratch.db, (uow) =>
        access.acceptInvitation(uow, {
          tokenHash: hash(token),
          subjectId: 'oidc-other',
          verifiedEmail: 'other@example.test',
          actor: 'user:oidc-other',
          authorizationContext: 'copalibre.invite.accept',
        }),
      ),
    ).rejects.toThrow('Verified email does not match');

    await expect(
      withTransaction(scratch.db, (uow) =>
        access.acceptInvitation(uow, {
          tokenHash: hash(token),
          subjectId: 'oidc-viewer',
          verifiedEmail: 'viewer@example.test',
          actor: 'user:oidc-viewer',
          authorizationContext: 'copalibre.invite.accept',
        }),
      ),
    ).resolves.toMatchObject({ role: 'viewer', status: 'active' });
  });

  it('accepts a new invitation for a soft-deleted principal and restores its assignment', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    const viewer = (await access.listAssignments(organizationId)).find(
      (assignment) => assignment.email === 'viewer@example.test',
    );
    if (!viewer) throw new Error('Expected viewer assignment from prior fixture');

    await withTransaction(scratch.db, (uow) =>
      access.deleteAssignment(uow, {
        organizationId,
        assignmentId: viewer.assignmentId,
        actor: 'user:oidc-admin',
        authorizationContext: 'copalibre.control',
      }),
    );

    const token = 'viewer-restoration-token';
    await withTransaction(scratch.db, (uow) =>
      access.createInvitation(uow, {
        organizationId,
        recipientEmail: 'viewer@example.test',
        role: 'referee',
        status: 'active',
        token,
        tokenHash: hash(token),
        expiresAt: '2099-08-04T00:00:00.000Z',
        actor: 'user:oidc-admin',
        authorizationContext: 'copalibre.control',
      }),
    );

    const restored = await withTransaction(scratch.db, (uow) =>
      access.acceptInvitation(uow, {
        tokenHash: hash(token),
        subjectId: 'oidc-viewer',
        verifiedEmail: 'viewer@example.test',
        actor: 'user:oidc-viewer',
        authorizationContext: 'copalibre.invite.accept',
      }),
    );

    expect(restored).toMatchObject({
      assignmentId: viewer.assignmentId,
      role: 'referee',
      status: 'active',
    });
    await expect(access.findAssignment(organizationId, viewer.principalId)).resolves.toEqual(
      restored,
    );
  });

  it('records actor, prior role and resulting role for a change', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    const assignment = (await access.listAssignments(organizationId)).find(
      (one) => one.role === 'referee',
    );
    if (!assignment) throw new Error('Expected referee assignment from prior fixture');

    await withTransaction(scratch.db, (uow) =>
      access.changeAssignment(uow, {
        organizationId,
        assignmentId: assignment.assignmentId,
        role: 'broadcaster',
        status: 'active',
        actor: 'user:oidc-admin',
        authorizationContext: 'copalibre.control',
      }),
    );

    const audit = await new AuditReader(scratch.db).historyFor(
      'organization-role-assignment',
      assignment.assignmentId,
    );
    const change = audit.find((entry) => entry.action === 'organization.role-changed');
    expect(change).toMatchObject({
      actor: 'user:oidc-admin',
      previousState: { role: 'referee', status: 'inactive' },
      resultingState: { role: 'broadcaster', status: 'active' },
    });
    expect(change?.occurredAt).toEqual(expect.any(String));
  });
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
