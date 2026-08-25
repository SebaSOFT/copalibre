import {
  wouldLeaveInstallationWithoutSuperAdmin,
  type InstallationRoleAssignment,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { toInstallationRoleAssignment } from '../mapping.js';
import { lockRowsForMutation } from '../row-lock.js';
import { SYSTEM_ORGANIZATION } from '../relay/scheduled-jobs.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AccessAuditContext } from './organization-access-repository.js';

export interface CreateSuperAdminInput extends AccessAuditContext {
  readonly principalId: string;
}

export interface ChangeInstallationRoleStatusInput extends AccessAuditContext {
  readonly assignmentId: string;
  readonly status: 'active' | 'inactive';
}

export interface DeleteInstallationRoleInput extends AccessAuditContext {
  readonly assignmentId: string;
}

/**
 * The installation-wide counterpart of `OrganizationAccessRepository`
 * (0140): the queryable, floor-invariant-protected source of truth for
 * "who holds installation-level super-admin". Every mutation is audited in
 * the same transaction, using `SYSTEM_ORGANIZATION` as the audit record's
 * organization scope since these assignments have no organization.
 */
export class InstallationRoleRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listActiveSuperAdmins(): Promise<readonly InstallationRoleAssignment[]> {
    const rows = await this.db
      .selectFrom('installation_role_assignments')
      .selectAll()
      .where('role', '=', 'super-admin')
      .where('status', '=', 'active')
      .where('deleted_at', 'is', null)
      .orderBy('created_at')
      .execute();
    return rows.map(toInstallationRoleAssignment);
  }

  async findActiveByPrincipal(
    principalId: string,
  ): Promise<InstallationRoleAssignment | undefined> {
    const row = await this.db
      .selectFrom('installation_role_assignments')
      .selectAll()
      .where('principal_id', '=', principalId)
      .where('role', '=', 'super-admin')
      .where('status', '=', 'active')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return row ? toInstallationRoleAssignment(row) : undefined;
  }

  async createSuperAdmin(
    uow: UnitOfWork,
    input: CreateSuperAdminInput,
  ): Promise<InstallationRoleAssignment> {
    const existing = await uow.tx
      .selectFrom('installation_role_assignments')
      .selectAll()
      .where('principal_id', '=', input.principalId)
      .executeTakeFirst();

    const now = new Date();
    const row = existing
      ? await uow.tx
          .updateTable('installation_role_assignments')
          .set({ role: 'super-admin', status: 'active', updated_at: now, deleted_at: null })
          .where('assignment_id', '=', existing.assignment_id)
          .returningAll()
          .executeTakeFirstOrThrow()
      : await uow.tx
          .insertInto('installation_role_assignments')
          .values({
            assignment_id: newId(),
            principal_id: input.principalId,
            role: 'super-admin',
            status: 'active',
            created_at: now,
            updated_at: now,
            deleted_at: null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

    const assignment = toInstallationRoleAssignment(row);
    await uow.recordAudit({
      organizationId: SYSTEM_ORGANIZATION,
      entityType: 'installation-role-assignment',
      entityId: assignment.assignmentId,
      action: 'installation.super-admin-created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...assignment },
    });
    return assignment;
  }

  async changeStatus(
    uow: UnitOfWork,
    input: ChangeInstallationRoleStatusInput,
  ): Promise<InstallationRoleAssignment> {
    const current = await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('installation_role_assignments')
        .selectAll()
        .where('assignment_id', '=', input.assignmentId)
        .where('deleted_at', 'is', null),
    ).executeTakeFirst();
    if (!current) throw new NotFoundError('Installation role assignment was not found');

    if (current.status === 'active' && input.status === 'inactive') {
      await this.assertFloorInvariant(uow, input.assignmentId);
    }

    const row = await uow.tx
      .updateTable('installation_role_assignments')
      .set({ status: input.status, updated_at: new Date() })
      .where('assignment_id', '=', input.assignmentId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const updated = toInstallationRoleAssignment(row);
    await uow.recordAudit({
      organizationId: SYSTEM_ORGANIZATION,
      entityType: 'installation-role-assignment',
      entityId: input.assignmentId,
      action: 'installation.super-admin-status-changed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toInstallationRoleAssignment(current) },
      resultingState: { ...updated },
    });
    return updated;
  }

  async deleteAssignment(
    uow: UnitOfWork,
    input: DeleteInstallationRoleInput,
  ): Promise<InstallationRoleAssignment> {
    const current = await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('installation_role_assignments')
        .selectAll()
        .where('assignment_id', '=', input.assignmentId)
        .where('deleted_at', 'is', null),
    ).executeTakeFirst();
    if (!current) throw new NotFoundError('Installation role assignment was not found');

    if (current.status === 'active') {
      await this.assertFloorInvariant(uow, input.assignmentId);
    }

    const deletedAt = new Date();
    const row = await uow.tx
      .updateTable('installation_role_assignments')
      .set({ status: 'inactive', updated_at: deletedAt, deleted_at: deletedAt })
      .where('assignment_id', '=', input.assignmentId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const deleted = toInstallationRoleAssignment(row);
    await uow.recordAudit({
      organizationId: SYSTEM_ORGANIZATION,
      entityType: 'installation-role-assignment',
      entityId: input.assignmentId,
      action: 'installation.super-admin-deleted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toInstallationRoleAssignment(current) },
      resultingState: { ...deleted },
    });
    return deleted;
  }

  /** Refuses within the same transaction as the write, avoiding a TOCTOU race. */
  private async assertFloorInvariant(
    uow: UnitOfWork,
    excludingAssignmentId: string,
  ): Promise<void> {
    const row = await uow.tx
      .selectFrom('installation_role_assignments')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('role', '=', 'super-admin')
      .where('status', '=', 'active')
      .where('deleted_at', 'is', null)
      .where('assignment_id', '!=', excludingAssignmentId)
      .executeTakeFirstOrThrow();
    const remaining = Number(row.count);
    if (wouldLeaveInstallationWithoutSuperAdmin(remaining)) {
      throw new InvariantViolationError(
        'The installation must always keep at least one active super-admin',
        { reason: 'floor-invariant' },
      );
    }
  }
}
