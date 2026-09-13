import {
  canCreateOrganizationInvitation,
  canGrantRole,
  isClubScopedRole,
  isOrganizationMemberStatus,
  isOrganizationRole,
  isTournamentScopedRole,
  normaliseEmail,
  validateOrganizationInvitation,
  wouldLeaveOrganizationWithoutAdmin,
  type GrantorContext,
  type OrganizationInvitation,
  type OrganizationMemberStatus,
  type OrganizationRole,
  type OrganizationRoleAssignment,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { toOrganizationInvitation, toOrganizationRoleAssignment } from '../mapping.js';
import { lockRowsForMutation } from '../row-lock.js';
import { IdentityPrincipalRepository } from './identity-principal-repository.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

export interface AccessAuditContext {
  readonly actor: string;
  readonly authorizationContext: string;
}

export interface CreateOrganizationInvitationInput extends AccessAuditContext {
  readonly organizationId: string;
  readonly recipientEmail: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  /** Required exactly when `role` is club-scoped (`isClubScopedRole`); absent otherwise. */
  readonly clubId?: string;
  /** Required exactly when `role` is tournament-scoped (`isTournamentScopedRole`); absent otherwise. */
  readonly tournamentId?: string;
  readonly tokenHash: string;
  /** Used only in the trusted outbox payload sent to the SMTP delivery adapter. */
  readonly token: string;
  readonly expiresAt: string;
  /**
   * Who is inviting, resolved by the caller. Omitted only by the
   * installation-bootstrap path, which has no organization yet and is
   * already gated by `canCreateOrganizationInvitation`'s first-assignment rule.
   */
  readonly grantorContext?: GrantorContext;
}

export interface AcceptOrganizationInvitationInput extends AccessAuditContext {
  readonly tokenHash: string;
  readonly subjectId: string;
  readonly verifiedEmail: string;
  readonly name?: string;
  readonly picture?: string;
  readonly now?: Date;
}

export interface ChangeOrganizationRoleInput extends AccessAuditContext {
  readonly organizationId: string;
  readonly assignmentId: string;
  readonly role: OrganizationRole;
  readonly status: OrganizationMemberStatus;
  /** Required exactly when `role` is club-scoped (`isClubScopedRole`); absent otherwise. */
  readonly clubId?: string;
  /** Required exactly when `role` is tournament-scoped (`isTournamentScopedRole`); absent otherwise. */
  readonly tournamentId?: string;
  readonly grantorContext?: GrantorContext;
}

export interface DeleteOrganizationRoleInput extends AccessAuditContext {
  readonly organizationId: string;
  readonly assignmentId: string;
}

export interface RescindOrganizationInvitationInput extends AccessAuditContext {
  readonly organizationId: string;
  readonly invitationId: string;
  /** Omitted only where the caller's authority is already established some other way. */
  readonly grantorContext?: GrantorContext;
}

/** One organization a principal has an active, non-deleted role in, with that role. */
export interface PrincipalOrganizationMembership {
  readonly organizationId: string;
  readonly organizationAlias: string;
  readonly organizationName: string;
  readonly role: OrganizationRole;
  readonly emblemObjectId?: string;
}

/**
 * The persistence boundary for organization access. Its mutation methods require
 * a UnitOfWork so the access decision, immutable audit record and outbox event
 * share one transaction.
 */
export class OrganizationAccessRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async listAssignments(organizationId: string): Promise<readonly OrganizationRoleAssignment[]> {
    const rows = await this.db
      .selectFrom('organization_role_assignments')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('deleted_at', 'is', null)
      .orderBy('created_at')
      .execute();
    return rows.map(toOrganizationRoleAssignment);
  }

  /** A soft-deleted assignment still means this organization has been bootstrapped. */
  async hasAnyAssignment(organizationId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('organization_role_assignments')
      .select('assignment_id')
      .where('organization_id', '=', organizationId)
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  /**
   * The reverse of `listAssignments`/`findAssignment`: every organization *this*
   * principal has a role in, rather than every principal in *one* organization.
   * Filtered to active, non-deleted assignments — an inactive or soft-deleted
   * one already fails every other admin-control route's guard check, so it
   * would be a dead end if surfaced here (design.md).
   */
  async listOrganizationsForPrincipal(
    principalId: string,
  ): Promise<readonly PrincipalOrganizationMembership[]> {
    const rows = await this.db
      .selectFrom('organization_role_assignments')
      .innerJoin(
        'organizations',
        'organizations.organization_id',
        'organization_role_assignments.organization_id',
      )
      .select([
        'organizations.organization_id as organization_id',
        'organizations.alias as organization_alias',
        'organizations.name as organization_name',
        'organizations.emblem_object_id as emblem_object_id',
        'organization_role_assignments.role as role',
      ])
      .where('organization_role_assignments.principal_id', '=', principalId)
      .where('organization_role_assignments.deleted_at', 'is', null)
      .where('organization_role_assignments.status', '=', 'active')
      .orderBy('organizations.name')
      .execute();
    return rows.map((row) => ({
      organizationId: row.organization_id,
      organizationAlias: row.organization_alias,
      organizationName: row.organization_name,
      role: row.role as OrganizationRole,
      ...(row.emblem_object_id ? { emblemObjectId: row.emblem_object_id } : {}),
    }));
  }

  async findAssignment(
    organizationId: string,
    principalId: string,
  ): Promise<OrganizationRoleAssignment | undefined> {
    const row = await this.db
      .selectFrom('organization_role_assignments')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('principal_id', '=', principalId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return row ? toOrganizationRoleAssignment(row) : undefined;
  }

  async createInvitation(
    uow: UnitOfWork,
    input: CreateOrganizationInvitationInput,
  ): Promise<OrganizationInvitation> {
    const invitationId = newId();
    const checked = validateOrganizationInvitation({
      invitationId,
      organizationId: input.organizationId,
      recipientEmail: input.recipientEmail,
      role: input.role,
      status: input.status,
      expiresAt: input.expiresAt,
      ...(input.clubId === undefined ? {} : { clubId: input.clubId }),
      ...(input.tournamentId === undefined ? {} : { tournamentId: input.tournamentId }),
    });
    if (!checked.ok)
      throw new InvariantViolationError(checked.error.message, checked.error.details);

    if (input.grantorContext) {
      const authorized = canGrantRole(
        input.grantorContext,
        checked.value.role,
        input.organizationId,
      );
      if (!authorized.ok) {
        throw new InvariantViolationError(authorized.error.message, { reason: 'grant-denied' });
      }
    }

    const firstAssignment = await uow.tx
      .selectFrom('organization_role_assignments')
      .select('assignment_id')
      .where('organization_id', '=', input.organizationId)
      .limit(1)
      .executeTakeFirst();
    const bootstrap = canCreateOrganizationInvitation(firstAssignment ? 1 : 0, checked.value.role);
    if (!bootstrap.ok) {
      throw new InvariantViolationError(bootstrap.error.message, bootstrap.error.details);
    }

    const row = await uow.tx
      .insertInto('organization_invites')
      .values({
        invitation_id: invitationId,
        organization_id: input.organizationId,
        recipient_email: checked.value.recipientEmail,
        role: checked.value.role,
        status: checked.value.status,
        token_hash: input.tokenHash,
        expires_at: new Date(checked.value.expiresAt),
        accepted_at: null,
        accepted_principal_id: null,
        created_at: new Date(),
        club_id: checked.value.clubId ?? null,
        tournament_id: checked.value.tournamentId ?? null,
        rescinded_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const invitation = toOrganizationInvitation(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'organization-invitation',
      entityId: invitationId,
      action: 'organization.invitation-created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...invitation },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `organization:${input.organizationId}`,
      entityId: invitationId,
      eventType: 'organization.invite.requested',
      projectionVersion: 1,
      payload: {
        invitationId,
        recipientEmail: invitation.recipientEmail,
        token: input.token,
        expiresAt: invitation.expiresAt,
      },
    });
    return invitation;
  }

  /** Pending invitations: not yet accepted, not rescinded, not expired — what the roles-permissions screen lists. */
  async listPendingInvitations(organizationId: string): Promise<readonly OrganizationInvitation[]> {
    const rows = await this.db
      .selectFrom('organization_invites')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('accepted_at', 'is', null)
      .where('rescinded_at', 'is', null)
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toOrganizationInvitation);
  }

  /**
   * Withdraws a pending invitation before it is accepted, following
   * `deleteAssignment`'s shape: lock the row, refuse based on current state,
   * write the terminal marker, audit with prior state. Requires the same
   * role-granting authority `createInvitation` required for this invitation's
   * role, so an org-admin cannot be blocked from correcting their own
   * club-admin's invitation mistake, and a club-admin (who cannot invite at
   * all) cannot rescind anything.
   */
  async rescindInvitation(
    uow: UnitOfWork,
    input: RescindOrganizationInvitationInput,
  ): Promise<OrganizationInvitation> {
    const current = await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('organization_invites')
        .selectAll()
        .where('organization_id', '=', input.organizationId)
        .where('invitation_id', '=', input.invitationId),
    ).executeTakeFirst();
    if (!current) throw new NotFoundError('Organization invitation was not found');

    if (current.accepted_at !== null) {
      throw new InvariantViolationError(
        'Organization invitation was already accepted; it can no longer be rescinded',
      );
    }
    if (current.rescinded_at !== null) {
      throw new InvariantViolationError('Organization invitation was already rescinded');
    }

    if (input.grantorContext) {
      const authorized = canGrantRole(
        input.grantorContext,
        current.role as OrganizationRole,
        input.organizationId,
      );
      if (!authorized.ok) {
        throw new InvariantViolationError(authorized.error.message, { reason: 'grant-denied' });
      }
    }

    const rescindedAt = new Date();
    const row = await uow.tx
      .updateTable('organization_invites')
      .set({ rescinded_at: rescindedAt })
      .where('invitation_id', '=', input.invitationId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const invitation = toOrganizationInvitation(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'organization-invitation',
      entityId: input.invitationId,
      action: 'organization.invitation-rescinded',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toOrganizationInvitation(current) },
      resultingState: { ...invitation },
    });
    return invitation;
  }

  async acceptInvitation(
    uow: UnitOfWork,
    input: AcceptOrganizationInvitationInput,
  ): Promise<OrganizationRoleAssignment> {
    const invitation = await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('organization_invites')
        .selectAll()
        .where('token_hash', '=', input.tokenHash),
    ).executeTakeFirst();
    if (!invitation) throw new NotFoundError('Organization invitation was not found');

    const now = input.now ?? new Date();
    if (invitation.accepted_at !== null) {
      throw new InvariantViolationError('Organization invitation was already accepted');
    }
    if (invitation.rescinded_at !== null) {
      throw new InvariantViolationError('Organization invitation was rescinded');
    }
    if (invitation.expires_at <= now) {
      throw new InvariantViolationError('Organization invitation expired');
    }
    if (normaliseEmail(input.verifiedEmail) !== invitation.recipient_email) {
      throw new InvariantViolationError('Verified email does not match organization invitation');
    }

    const principal = await new IdentityPrincipalRepository(this.db).bindVerifiedOidcIdentity(uow, {
      subjectId: input.subjectId,
      verifiedEmail: input.verifiedEmail,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.picture === undefined ? {} : { picture: input.picture }),
    });

    const firstAssignment = await uow.tx
      .selectFrom('organization_role_assignments')
      .select('assignment_id')
      .where('organization_id', '=', invitation.organization_id)
      .limit(1)
      .executeTakeFirst();
    const bootstrap = canCreateOrganizationInvitation(
      firstAssignment ? 1 : 0,
      invitation.role as OrganizationRole,
    );
    if (!bootstrap.ok) {
      throw new InvariantViolationError(bootstrap.error.message, bootstrap.error.details);
    }

    const existingAssignment = await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('organization_role_assignments')
        .selectAll()
        .where('organization_id', '=', invitation.organization_id)
        .where('principal_id', '=', principal.principalId),
    ).executeTakeFirst();

    // A fresh invitation may restore a soft-deleted member. The unique
    // organization/principal relation deliberately preserves their audit trail.
    const assignmentRow = existingAssignment
      ? await uow.tx
          .updateTable('organization_role_assignments')
          .set({
            email: invitation.recipient_email,
            role: invitation.role,
            status: invitation.status,
            updated_at: now,
            deleted_at: null,
            club_id: invitation.club_id,
            tournament_id: invitation.tournament_id,
          })
          .where('assignment_id', '=', existingAssignment.assignment_id)
          .returningAll()
          .executeTakeFirstOrThrow()
      : await uow.tx
          .insertInto('organization_role_assignments')
          .values({
            assignment_id: newId(),
            organization_id: invitation.organization_id,
            principal_id: principal.principalId,
            email: invitation.recipient_email,
            role: invitation.role,
            status: invitation.status,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            club_id: invitation.club_id,
            tournament_id: invitation.tournament_id,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

    await uow.tx
      .updateTable('organization_invites')
      .set({ accepted_at: now, accepted_principal_id: principal.principalId })
      .where('invitation_id', '=', invitation.invitation_id)
      .execute();

    const assignment = toOrganizationRoleAssignment(assignmentRow);
    await uow.recordAudit({
      organizationId: assignment.organizationId,
      entityType: 'organization-role-assignment',
      entityId: assignment.assignmentId,
      action: 'organization.role-assigned',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: existingAssignment
        ? {
            ...toOrganizationRoleAssignment(existingAssignment),
            invitationId: invitation.invitation_id,
          }
        : { invitationId: invitation.invitation_id, role: null, status: null },
      resultingState: { ...assignment },
    });
    await uow.publishEvent({
      organizationId: assignment.organizationId,
      stream: `organization:${assignment.organizationId}`,
      entityId: assignment.assignmentId,
      eventType: 'organization.role-assigned',
      projectionVersion: 1,
      payload: { assignmentId: assignment.assignmentId, principalId: assignment.principalId },
    });
    return assignment;
  }

  async changeAssignment(
    uow: UnitOfWork,
    input: ChangeOrganizationRoleInput,
  ): Promise<OrganizationRoleAssignment> {
    if (!isOrganizationRole(input.role) || !isOrganizationMemberStatus(input.status)) {
      throw new InvariantViolationError('Unknown organization role or member status');
    }
    const clubScoped = isClubScopedRole(input.role);
    if (clubScoped && input.clubId === undefined) {
      throw new InvariantViolationError(`The "${input.role}" role requires naming a club`);
    }
    if (!clubScoped && input.clubId !== undefined) {
      throw new InvariantViolationError(
        `A club may only be named when the role is club-scoped, not "${input.role}"`,
      );
    }
    const tournamentScoped = isTournamentScopedRole(input.role);
    if (tournamentScoped && input.tournamentId === undefined) {
      throw new InvariantViolationError(`The "${input.role}" role requires naming a tournament`);
    }
    if (!tournamentScoped && input.tournamentId !== undefined) {
      throw new InvariantViolationError(
        `A tournament may only be named when the role is tournament-scoped, not "${input.role}"`,
      );
    }
    const current = await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('organization_role_assignments')
        .selectAll()
        .where('organization_id', '=', input.organizationId)
        .where('assignment_id', '=', input.assignmentId)
        .where('deleted_at', 'is', null),
    ).executeTakeFirst();
    if (!current) throw new NotFoundError('Organization role assignment was not found');

    if (input.grantorContext) {
      const authorized = canGrantRole(input.grantorContext, input.role, input.organizationId);
      if (!authorized.ok) {
        throw new InvariantViolationError(authorized.error.message, { reason: 'grant-denied' });
      }
    }

    const demotedFromAdmin =
      current.role === 'admin' &&
      current.status === 'active' &&
      (input.role !== 'admin' || input.status !== 'active');
    if (demotedFromAdmin) {
      await this.assertOrganizationAdminFloorInvariant(
        uow,
        input.organizationId,
        input.assignmentId,
      );
    }

    const row = await uow.tx
      .updateTable('organization_role_assignments')
      .set({
        role: input.role,
        status: input.status,
        updated_at: new Date(),
        club_id: input.clubId ?? null,
        tournament_id: input.tournamentId ?? null,
      })
      .where('assignment_id', '=', input.assignmentId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const updated = toOrganizationRoleAssignment(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'organization-role-assignment',
      entityId: input.assignmentId,
      action: 'organization.role-changed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toOrganizationRoleAssignment(current) },
      resultingState: { ...updated },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `organization:${input.organizationId}`,
      entityId: input.assignmentId,
      eventType: 'organization.role-changed',
      projectionVersion: 1,
      payload: { assignmentId: input.assignmentId, principalId: updated.principalId },
    });
    return updated;
  }

  async deleteAssignment(
    uow: UnitOfWork,
    input: DeleteOrganizationRoleInput,
  ): Promise<OrganizationRoleAssignment> {
    const current = await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('organization_role_assignments')
        .selectAll()
        .where('organization_id', '=', input.organizationId)
        .where('assignment_id', '=', input.assignmentId)
        .where('deleted_at', 'is', null),
    ).executeTakeFirst();
    if (!current) throw new NotFoundError('Organization role assignment was not found');

    if (current.role === 'admin' && current.status === 'active') {
      await this.assertOrganizationAdminFloorInvariant(
        uow,
        input.organizationId,
        input.assignmentId,
      );
    }

    const deletedAt = new Date();
    const row = await uow.tx
      .updateTable('organization_role_assignments')
      .set({ status: 'inactive', updated_at: deletedAt, deleted_at: deletedAt })
      .where('assignment_id', '=', input.assignmentId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const deleted = toOrganizationRoleAssignment(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'organization-role-assignment',
      entityId: input.assignmentId,
      action: 'organization.role-deleted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toOrganizationRoleAssignment(current) },
      resultingState: { ...deleted },
    });
    return deleted;
  }

  /** Refuses within the same transaction as the write, avoiding a TOCTOU race. */
  private async assertOrganizationAdminFloorInvariant(
    uow: UnitOfWork,
    organizationId: string,
    excludingAssignmentId: string,
  ): Promise<void> {
    const row = await uow.tx
      .selectFrom('organization_role_assignments')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('organization_id', '=', organizationId)
      .where('role', '=', 'admin')
      .where('status', '=', 'active')
      .where('deleted_at', 'is', null)
      .where('assignment_id', '!=', excludingAssignmentId)
      .executeTakeFirstOrThrow();
    const remaining = Number(row.count);
    if (wouldLeaveOrganizationWithoutAdmin(remaining)) {
      throw new InvariantViolationError(
        'The organization must always keep at least one active admin',
        { reason: 'floor-invariant' },
      );
    }
  }
}
