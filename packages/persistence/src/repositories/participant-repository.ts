import { Alias, type Entrant, type Participant, type Roster, type Team } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError } from '../errors';
import { newId } from '../ids';
import { toEntrant, toParticipant, toRoster, toTeam } from '../mapping';
import type { Database } from '../schema';
import type { UnitOfWork } from '../transaction';

export interface AuditContext {
  readonly organizationId: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

export class ParticipantRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createParticipant(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly alias?: string;
      readonly displayName: string;
      readonly type: Participant['type'];
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Participant> {
    if (input.alias !== undefined) {
      const alias = Alias.create('participant', input.alias);
      if (!alias.ok) {
        throw new InvariantViolationError(alias.error.message, { alias: input.alias });
      }
    }

    const participantId = newId();
    const row = await uow.tx
      .insertInto('participants')
      .values({
        participant_id: participantId,
        organization_id: input.organizationId,
        alias: input.alias ?? null,
        display_name: input.displayName,
        participant_type: input.type,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const participant = toParticipant(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'participant',
      entityId: participantId,
      action: 'participant.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...participant },
    });
    return participant;
  }

  async createTeam(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly clubId?: string;
      readonly name: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Team> {
    const teamId = newId();
    const row = await uow.tx
      .insertInto('teams')
      .values({
        team_id: teamId,
        organization_id: input.organizationId,
        club_id: input.clubId ?? null,
        name: input.name,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const team = toTeam(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'team',
      entityId: teamId,
      action: 'team.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...team },
    });
    return team;
  }

  async saveRoster(
    uow: UnitOfWork,
    input: { readonly teamId: string; readonly members: Roster['members'] } & AuditContext,
  ): Promise<Roster> {
    const rosterId = newId();
    const row = await uow.tx
      .insertInto('rosters')
      .values({
        roster_id: rosterId,
        team_id: input.teamId,
        members: JSON.stringify(input.members),
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const roster = toRoster(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'roster',
      entityId: rosterId,
      action: 'roster.saved',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { rosterId, memberCount: input.members.length },
    });
    return roster;
  }

  /** Registration intake. Status transitions are audited individually. */
  async registerEntrant(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly entrantRef: Entrant['entrantRef'];
      readonly seed?: number;
    } & AuditContext,
  ): Promise<Entrant> {
    const entrantId = newId();
    const row = await uow.tx
      .insertInto('entrants')
      .values({
        entrant_id: entrantId,
        tournament_id: input.tournamentId,
        entrant_kind: input.entrantRef.kind,
        participant_id:
          input.entrantRef.kind === 'participant' ? input.entrantRef.participantId : null,
        team_id: input.entrantRef.kind === 'team' ? input.entrantRef.teamId : null,
        seed: input.seed ?? null,
        status: 'pending',
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const entrant = toEntrant(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'entrant',
      entityId: entrantId,
      action: 'entrant.registered',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...entrant },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${input.tournamentId}`,
      entityId: entrantId,
      eventType: 'entrant.registered',
      projectionVersion: 1,
      payload: { entrantId, tournamentId: input.tournamentId, status: entrant.status },
    });
    return entrant;
  }

  async setEntrantStatus(
    uow: UnitOfWork,
    input: {
      readonly entrantId: string;
      readonly status: Entrant['status'];
      readonly reason?: string;
    } & AuditContext,
  ): Promise<Entrant> {
    const before = await this.findEntrant(input.entrantId);
    if (!before) {
      throw new InvariantViolationError(`Entrant ${input.entrantId} does not exist`, {
        entrantId: input.entrantId,
      });
    }

    const row = await uow.tx
      .updateTable('entrants')
      .set({ status: input.status })
      .where('entrant_id', '=', input.entrantId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const entrant = toEntrant(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'entrant',
      entityId: input.entrantId,
      action: `entrant.${input.status}`,
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { status: before.status },
      resultingState: { status: entrant.status },
      reason: input.reason,
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${entrant.tournamentId}`,
      entityId: input.entrantId,
      eventType: 'entrant.status-changed',
      projectionVersion: 1,
      payload: { entrantId: input.entrantId, status: entrant.status },
    });
    return entrant;
  }

  async findEntrant(entrantId: string): Promise<Entrant | undefined> {
    const row = await this.db
      .selectFrom('entrants')
      .selectAll()
      .where('entrant_id', '=', entrantId)
      .executeTakeFirst();
    return row ? toEntrant(row) : undefined;
  }

  async listEntrants(tournamentId: string): Promise<readonly Entrant[]> {
    const rows = await this.db
      .selectFrom('entrants')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('created_at')
      .execute();
    return rows.map(toEntrant);
  }
}
