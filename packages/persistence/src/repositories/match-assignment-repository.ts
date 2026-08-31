import type { Kysely } from 'kysely';
import { validateAssignment, type MatchAssignment, type MatchCapability } from '@copalibre/domain';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

/**
 * Match-operating appointments.
 *
 * Reads are deliberately narrow: `forSubject` returns only the grants that
 * could bear on one match, so the policy layer decides over a handful of rows
 * rather than a subject's whole history. The decision itself stays in the
 * domain, where it can be tested without a database.
 */
export class MatchAssignmentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async appoint(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly subjectId: string;
      readonly scope: MatchAssignment['scope'];
      readonly capabilities: readonly MatchCapability[];
    } & AuditContext,
  ): Promise<MatchAssignment> {
    const assignment: MatchAssignment = {
      assignmentId: newId(),
      organizationId: input.organizationId,
      subjectId: input.subjectId,
      scope: input.scope,
      capabilities: input.capabilities,
    };

    const validation = validateAssignment(assignment);
    if (!validation.ok) {
      throw new InvariantViolationError(validation.error.message, validation.error.details);
    }

    const row = await uow.tx
      .insertInto('match_assignments')
      .values({
        assignment_id: assignment.assignmentId,
        organization_id: assignment.organizationId,
        subject_id: assignment.subjectId,
        match_id: assignment.scope.kind === 'match' ? assignment.scope.matchId : null,
        stage_id: assignment.scope.kind === 'stage' ? assignment.scope.stageId : null,
        capabilities: JSON.stringify(assignment.capabilities),
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // An appointment is who was allowed to touch a match, which is exactly the
    // question an audit asks after a disputed result.
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match-assignment',
      entityId: assignment.assignmentId,
      action: 'match-assignment.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...toAssignment(row) },
    });

    return toAssignment(row);
  }

  async revoke(
    uow: UnitOfWork,
    input: { readonly assignmentId: string; readonly organizationId: string } & AuditContext,
  ): Promise<void> {
    const existing = await uow.tx
      .selectFrom('match_assignments')
      .selectAll()
      .where('assignment_id', '=', input.assignmentId)
      .executeTakeFirst();
    if (!existing) return;

    await uow.tx
      .deleteFrom('match_assignments')
      .where('assignment_id', '=', input.assignmentId)
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'match-assignment',
      entityId: input.assignmentId,
      action: 'match-assignment.revoked',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toAssignment(existing) },
    });
  }

  /** Every grant that could cover this match: its own, and its stage's. */
  async forSubject(input: {
    readonly organizationId: string;
    readonly subjectId: string;
    readonly matchId: string;
    readonly stageId: string;
  }): Promise<readonly MatchAssignment[]> {
    const rows = await this.db
      .selectFrom('match_assignments')
      .selectAll()
      .where('organization_id', '=', input.organizationId)
      .where('subject_id', '=', input.subjectId)
      .where((eb) =>
        eb.or([eb('match_id', '=', input.matchId), eb('stage_id', '=', input.stageId)]),
      )
      .execute();

    return rows.map(toAssignment);
  }

  async listForMatch(matchId: string): Promise<readonly MatchAssignment[]> {
    const rows = await this.db
      .selectFrom('match_assignments')
      .selectAll()
      .where('match_id', '=', matchId)
      .execute();
    return rows.map(toAssignment);
  }
}

interface AssignmentRow {
  readonly assignment_id: string;
  readonly organization_id: string;
  readonly subject_id: string;
  readonly match_id: string | null;
  readonly stage_id: string | null;
  readonly capabilities: unknown;
}

function toAssignment(row: AssignmentRow): MatchAssignment {
  return {
    assignmentId: row.assignment_id,
    organizationId: row.organization_id,
    subjectId: row.subject_id,
    scope:
      row.match_id !== null
        ? { kind: 'match', matchId: row.match_id }
        : { kind: 'stage', stageId: row.stage_id ?? '' },
    capabilities: row.capabilities as readonly MatchCapability[],
  };
}
