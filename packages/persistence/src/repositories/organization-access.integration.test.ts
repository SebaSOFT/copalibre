import { createHash } from 'node:crypto';
import {
  AuditReader,
  EnrollmentRepository,
  InvariantViolationError,
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

describe('listing every organization a principal belongs to', () => {
  let scratch: ScratchDatabase;
  let orgAlpha: string;
  let orgBeta: string;
  let orgGamma: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('organization-access-directory');
    orgAlpha = (
      await withTransaction(scratch.db, (uow) =>
        new OrganizationRepository(scratch.db).create(uow, {
          alias: 'liga-alfa',
          name: 'Liga Alfa',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      )
    ).organizationId;
    orgBeta = (
      await withTransaction(scratch.db, (uow) =>
        new OrganizationRepository(scratch.db).create(uow, {
          alias: 'liga-beta',
          name: 'Liga Beta',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      )
    ).organizationId;
    orgGamma = (
      await withTransaction(scratch.db, (uow) =>
        new OrganizationRepository(scratch.db).create(uow, {
          alias: 'liga-gamma',
          name: 'Liga Gamma',
          actor: 'user:seed',
          authorizationContext: 'seed',
        }),
      )
    ).organizationId;

    // Bootstrap each of beta/gamma with its own admin first — a later
    // referee/viewer invitation for the "directory" principal is only legal
    // once an organization already has its first (admin) assignment.
    await bootstrapAdmin(orgBeta, 'beta-admin@example.test', 'oidc-beta-admin');
    await bootstrapAdmin(orgGamma, 'gamma-admin@example.test', 'oidc-gamma-admin');
  });

  async function bootstrapAdmin(
    organizationId: string,
    email: string,
    subjectId: string,
  ): Promise<void> {
    const access = new OrganizationAccessRepository(scratch.db);
    const token = `bootstrap-${subjectId}`;
    await withTransaction(scratch.db, (uow) =>
      access.createInvitation(uow, {
        organizationId,
        recipientEmail: email,
        role: 'admin',
        status: 'active',
        token,
        tokenHash: hash(token),
        expiresAt: '2099-08-04T00:00:00.000Z',
        actor: 'user:super-admin',
        authorizationContext: 'copalibre.super-admin',
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      access.acceptInvitation(uow, {
        tokenHash: hash(token),
        subjectId,
        verifiedEmail: email,
        actor: `user:${subjectId}`,
        authorizationContext: 'copalibre.invite.accept',
      }),
    );
  }

  afterAll(async () => scratch.drop());

  it('returns an empty list for a principal with no assignment at all', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    await expect(
      access.listOrganizationsForPrincipal('01800000-0000-7000-8000-000000000099'),
    ).resolves.toEqual([]);
  });

  it('returns exactly the organizations with an active, non-deleted assignment', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    const bootstrapToken = 'directory-admin-token';
    await withTransaction(scratch.db, (uow) =>
      access.createInvitation(uow, {
        organizationId: orgAlpha,
        recipientEmail: 'directory@example.test',
        role: 'admin',
        status: 'active',
        token: bootstrapToken,
        tokenHash: hash(bootstrapToken),
        expiresAt: '2099-08-04T00:00:00.000Z',
        actor: 'user:super-admin',
        authorizationContext: 'copalibre.super-admin',
      }),
    );
    const admin = await withTransaction(scratch.db, (uow) =>
      access.acceptInvitation(uow, {
        tokenHash: hash(bootstrapToken),
        subjectId: 'oidc-directory-admin',
        verifiedEmail: 'directory@example.test',
        actor: 'user:oidc-directory-admin',
        authorizationContext: 'copalibre.invite.accept',
      }),
    );

    // A second, active assignment for the same principal in another organization.
    const betaToken = 'directory-beta-token';
    await withTransaction(scratch.db, (uow) =>
      access.createInvitation(uow, {
        organizationId: orgBeta,
        recipientEmail: 'directory@example.test',
        role: 'referee',
        status: 'active',
        token: betaToken,
        tokenHash: hash(betaToken),
        expiresAt: '2099-08-04T00:00:00.000Z',
        actor: 'user:oidc-beta-admin',
        authorizationContext: 'copalibre.control',
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      access.acceptInvitation(uow, {
        tokenHash: hash(betaToken),
        subjectId: 'oidc-directory-admin',
        verifiedEmail: 'directory@example.test',
        actor: 'user:oidc-directory-admin',
        authorizationContext: 'copalibre.invite.accept',
      }),
    );

    // An inactive assignment in a third organization — must not appear.
    const gammaToken = 'directory-gamma-token';
    await withTransaction(scratch.db, (uow) =>
      access.createInvitation(uow, {
        organizationId: orgGamma,
        recipientEmail: 'directory@example.test',
        role: 'viewer',
        status: 'inactive',
        token: gammaToken,
        tokenHash: hash(gammaToken),
        expiresAt: '2099-08-04T00:00:00.000Z',
        actor: 'user:oidc-gamma-admin',
        authorizationContext: 'copalibre.control',
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      access.acceptInvitation(uow, {
        tokenHash: hash(gammaToken),
        subjectId: 'oidc-directory-admin',
        verifiedEmail: 'directory@example.test',
        actor: 'user:oidc-directory-admin',
        authorizationContext: 'copalibre.invite.accept',
      }),
    );

    const memberships = await access.listOrganizationsForPrincipal(admin.principalId);
    expect(memberships).toEqual([
      {
        organizationId: orgAlpha,
        organizationAlias: 'liga-alfa',
        organizationName: 'Liga Alfa',
        role: 'admin',
      },
      {
        organizationId: orgBeta,
        organizationAlias: 'liga-beta',
        organizationName: 'Liga Beta',
        role: 'referee',
      },
    ]);
  });

  it('excludes a soft-deleted assignment', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    const token = 'directory-soft-deleted-token';
    await withTransaction(scratch.db, (uow) =>
      access.createInvitation(uow, {
        organizationId: orgGamma,
        recipientEmail: 'soon-removed@example.test',
        role: 'viewer',
        status: 'active',
        token,
        tokenHash: hash(token),
        expiresAt: '2099-08-04T00:00:00.000Z',
        actor: 'user:oidc-gamma-admin',
        authorizationContext: 'copalibre.control',
      }),
    );
    const assignment = await withTransaction(scratch.db, (uow) =>
      access.acceptInvitation(uow, {
        tokenHash: hash(token),
        subjectId: 'oidc-soon-removed',
        verifiedEmail: 'soon-removed@example.test',
        actor: 'user:oidc-soon-removed',
        authorizationContext: 'copalibre.invite.accept',
      }),
    );

    await expect(access.listOrganizationsForPrincipal(assignment.principalId)).resolves.toEqual([
      {
        organizationId: orgGamma,
        organizationAlias: 'liga-gamma',
        organizationName: 'Liga Gamma',
        role: 'viewer',
      },
    ]);

    await withTransaction(scratch.db, (uow) =>
      access.deleteAssignment(uow, {
        organizationId: orgGamma,
        assignmentId: assignment.assignmentId,
        actor: 'user:oidc-gamma-admin',
        authorizationContext: 'copalibre.control',
      }),
    );

    await expect(access.listOrganizationsForPrincipal(assignment.principalId)).resolves.toEqual([]);
  });
});

describe('role-granting hierarchy and last-admin floor invariant (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('organization-access-rbac');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-rbac',
        name: 'Liga RBAC',
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => scratch.drop());

  async function invite(
    access: OrganizationAccessRepository,
    input: {
      readonly recipientEmail: string;
      readonly role: 'admin' | 'club-admin' | 'referee' | 'broadcaster' | 'viewer';
      readonly grantorContext?: { isSuperAdmin: boolean; organizationAdminOf?: string };
      readonly clubId?: string;
    },
  ) {
    const token = input.recipientEmail;
    await withTransaction(scratch.db, (uow) =>
      access.createInvitation(uow, {
        organizationId,
        recipientEmail: input.recipientEmail,
        role: input.role,
        status: 'active',
        token,
        tokenHash: hash(token),
        expiresAt: '2099-08-04T00:00:00.000Z',
        actor: 'user:test',
        authorizationContext: 'copalibre.control',
        ...(input.grantorContext ? { grantorContext: input.grantorContext } : {}),
        ...(input.clubId ? { clubId: input.clubId } : {}),
      }),
    );
    return withTransaction(scratch.db, (uow) =>
      access.acceptInvitation(uow, {
        tokenHash: hash(token),
        subjectId: `oidc-${input.recipientEmail}`,
        verifiedEmail: input.recipientEmail,
        actor: `user:${input.recipientEmail}`,
        authorizationContext: 'copalibre.invite.accept',
      }),
    );
  }

  it('bootstraps the first admin with no grantor context', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    await expect(
      invite(access, { recipientEmail: 'rbac-admin@example.test', role: 'admin' }),
    ).resolves.toMatchObject({ role: 'admin', status: 'active' });
  });

  it('lets a super-admin grantor invite a club-admin', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    const club = await withTransaction(scratch.db, (uow) =>
      new EnrollmentRepository(scratch.db).createClub(uow, {
        organizationId,
        name: 'Club RBAC',
        alias: 'club-rbac',
        actor: 'user:test',
        authorizationContext: 'copalibre.control',
      }),
    );
    await expect(
      invite(access, {
        recipientEmail: 'rbac-club-admin@example.test',
        role: 'club-admin',
        grantorContext: { isSuperAdmin: true },
        clubId: club.clubId,
      }),
    ).resolves.toMatchObject({ role: 'club-admin', clubId: club.clubId });
  });

  it("refuses an organization admin's grant crossing into another organization", async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    await expect(
      invite(access, {
        recipientEmail: 'rbac-cross-org@example.test',
        role: 'referee',
        grantorContext: { isSuperAdmin: false, organizationAdminOf: 'some-other-org-id' },
      }),
    ).rejects.toThrow(InvariantViolationError);
  });

  it('lets an organization admin grantor invite a referee within their own organization', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    await expect(
      invite(access, {
        recipientEmail: 'rbac-org-admin-referee@example.test',
        role: 'referee',
        grantorContext: { isSuperAdmin: false, organizationAdminOf: organizationId },
      }),
    ).resolves.toMatchObject({ role: 'referee' });
  });

  it('refuses demoting the last active admin, then allows it once a second admin exists', async () => {
    const access = new OrganizationAccessRepository(scratch.db);
    const admin = (await access.listAssignments(organizationId)).find(
      (row) => row.email === 'rbac-admin@example.test',
    );
    if (!admin) throw new Error('Expected the bootstrap admin assignment');

    await expect(
      withTransaction(scratch.db, (uow) =>
        access.changeAssignment(uow, {
          organizationId,
          assignmentId: admin.assignmentId,
          role: 'viewer',
          status: 'active',
          actor: 'user:test',
          authorizationContext: 'copalibre.control',
        }),
      ),
    ).rejects.toThrow(InvariantViolationError);

    const secondAdmin = await invite(access, {
      recipientEmail: 'rbac-second-admin@example.test',
      role: 'admin',
      grantorContext: { isSuperAdmin: true },
    });

    await expect(
      withTransaction(scratch.db, (uow) =>
        access.changeAssignment(uow, {
          organizationId,
          assignmentId: admin.assignmentId,
          role: 'viewer',
          status: 'active',
          actor: 'user:test',
          authorizationContext: 'copalibre.control',
        }),
      ),
    ).resolves.toMatchObject({ role: 'viewer' });

    await expect(
      withTransaction(scratch.db, (uow) =>
        access.deleteAssignment(uow, {
          organizationId,
          assignmentId: secondAdmin.assignmentId,
          actor: 'user:test',
          authorizationContext: 'copalibre.control',
        }),
      ),
    ).rejects.toThrow(InvariantViolationError);
  });
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
