import {
  Abbreviation,
  Alias,
  suggestAvailableAlias,
  validateAttributes,
  type Club,
  type Entrant,
  type EntrantAttribute,
  type SeedPlacement,
  type StageAllocation,
  type Team,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import { toClub, toEntrant, toEntrantAttribute, toTeam } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

export interface AuditContext {
  readonly organizationId: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

export interface ParticipantTeamMembership {
  readonly playerId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly role: string;
}

export interface ParticipantReportedResult {
  readonly matchId: string;
  readonly entrantId: string;
  readonly status: string;
  readonly result: Record<string, unknown> | null;
}

export class EnrollmentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Creates a club (0037).
   *
   * The table has existed since `0004` with nothing to write to it — clubs
   * arrived through imports and fixtures. It gets a write path now because the
   * abbreviation has to be settable somewhere, and validated before any SQL runs
   * rather than by a check constraint that can only say "no".
   */
  async createClub(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly name: string;
      readonly alias?: string;
      readonly abbreviation?: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Club> {
    assertAbbreviation(input.abbreviation);

    // A given alias is validated; an absent one is suggested from the name and
    // disambiguated against what this organization already uses. Two clubs
    // named "Talleres" is ordinary, and making the second one's organizer
    // invent a suffix by hand is not.
    const alias = input.alias ?? (await this.suggestClubAlias(input.organizationId, input.name));
    assertAlias(alias);

    const clubId = newId();
    const row = await uow.tx
      .insertInto('clubs')
      .values({
        club_id: clubId,
        organization_id: input.organizationId,
        alias: alias ?? null,
        name: input.name,
        abbreviation: input.abbreviation ?? null,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const club = toClub(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'club',
      entityId: clubId,
      action: 'club.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...club },
    });
    return club;
  }

  /**
   * The alias this organization would give a club of this name.
   *
   * Exposed so a console can show it in the form *before* anything is created —
   * a suggestion the organizer never sees is a derivation, and this capability
   * derives a URL, not a name.
   */
  async suggestClubAlias(organizationId: string, name: string): Promise<string | undefined> {
    const rows = await this.db
      .selectFrom('clubs')
      .select('alias')
      .where('organization_id', '=', organizationId)
      .where('alias', 'is not', null)
      .execute();

    return suggestAvailableAlias(
      name,
      rows.flatMap((row) => (row.alias === null ? [] : [row.alias])),
    );
  }

  /** Renames a club or changes its short label, keeping what it was. */
  async updateClub(
    uow: UnitOfWork,
    input: {
      readonly clubId: string;
      readonly organizationId: string;
      readonly name?: string;
      readonly alias?: string;
      readonly abbreviation?: string | null;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Club> {
    if (input.abbreviation !== null) assertAbbreviation(input.abbreviation);
    assertAlias(input.alias);

    const previous = await this.findClub(input.clubId);
    const row = await uow.tx
      .updateTable('clubs')
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.alias === undefined ? {} : { alias: input.alias }),
        ...(input.abbreviation === undefined ? {} : { abbreviation: input.abbreviation }),
      })
      .where('club_id', '=', input.clubId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const club = toClub(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'club',
      entityId: input.clubId,
      action: 'club.updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous === undefined ? {} : { previousState: { ...previous } }),
      resultingState: { ...club },
    });
    return club;
  }

  async findClub(clubId: string): Promise<Club | undefined> {
    const row = await this.db
      .selectFrom('clubs')
      .selectAll()
      .where('club_id', '=', clubId)
      .executeTakeFirst();
    return row ? toClub(row) : undefined;
  }

  async createTeam(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly alias?: string;
      readonly clubId?: string;
      readonly name: string;
      readonly disciplineId?: string;
      readonly abbreviation?: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Team> {
    assertAbbreviation(input.abbreviation);
    const alias = input.alias ?? (await this.suggestTeamAlias(input.organizationId, input.name));
    assertAlias(alias);

    const teamId = newId();
    const row = await uow.tx
      .insertInto('teams')
      .values({
        team_id: teamId,
        organization_id: input.organizationId,
        alias,
        club_id: input.clubId ?? null,
        discipline_id: input.disciplineId ?? null,
        name: input.name,
        abbreviation: input.abbreviation ?? null,
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

  /**
   * Changes a team's short label. Separate from creation because two sides of
   * one club usually get theirs when the second one enters — at which point the
   * first is already playing.
   */
  async updateTeam(
    uow: UnitOfWork,
    input: {
      readonly teamId: string;
      readonly organizationId: string;
      readonly name?: string;
      readonly abbreviation?: string | null;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Team> {
    if (input.abbreviation !== null) assertAbbreviation(input.abbreviation);

    const previous = await this.findTeam(input.teamId);
    const row = await uow.tx
      .updateTable('teams')
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.abbreviation === undefined ? {} : { abbreviation: input.abbreviation }),
      })
      .where('team_id', '=', input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const team = toTeam(row);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'team',
      entityId: input.teamId,
      action: 'team.updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous === undefined ? {} : { previousState: { ...previous } }),
      resultingState: { ...team },
    });
    return team;
  }

  async findTeam(teamId: string): Promise<Team | undefined> {
    const row = await this.db
      .selectFrom('teams')
      .selectAll()
      .where('team_id', '=', teamId)
      .executeTakeFirst();
    return row ? toTeam(row) : undefined;
  }

  async findTeamByAlias(organizationId: string, alias: string): Promise<Team | undefined> {
    const row = await this.db
      .selectFrom('teams')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('alias', '=', alias)
      .executeTakeFirst();
    return row ? toTeam(row) : undefined;
  }

  async replaceTeamByAlias(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly alias: string;
      readonly name: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<{ readonly team: Team; readonly created: boolean }> {
    const existing = await this.findTeamByAlias(input.organizationId, input.alias);
    if (!existing) {
      return {
        team: await this.createTeam(uow, input),
        created: true,
      };
    }
    return {
      team: await this.updateTeam(uow, {
        teamId: existing.teamId,
        organizationId: input.organizationId,
        name: input.name,
        actor: input.actor,
        authorizationContext: input.authorizationContext,
      }),
      created: false,
    };
  }

  async findEntrantForRef(
    tournamentId: string,
    entrantRef: Entrant['entrantRef'],
  ): Promise<Entrant | undefined> {
    const row = await this.db
      .selectFrom('entrants')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .where(
        entrantRef.kind === 'person' ? 'person_id' : 'team_id',
        '=',
        entrantRef.kind === 'person' ? entrantRef.personId : entrantRef.teamId,
      )
      .executeTakeFirst();
    return row ? toEntrant(row) : undefined;
  }

  private async suggestTeamAlias(organizationId: string, name: string): Promise<string> {
    const rows = await this.db
      .selectFrom('teams')
      .select('alias')
      .where('organization_id', '=', organizationId)
      .where('alias', 'is not', null)
      .execute();
    const aliases = rows.flatMap((row) => (row.alias === null ? [] : [row.alias]));
    return suggestAvailableAlias(name, aliases) ?? nextAlias('team', aliases);
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
        person_id: input.entrantRef.kind === 'person' ? input.entrantRef.personId : null,
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

  /**
   * Replaces an entrant's attribute set as one audited write.
   *
   * Replace rather than merge: an operator correcting a region typo should not
   * have to delete the wrong value first, and the audit record then reads as
   * "these were the attributes before, these are the attributes now" instead of
   * a per-key trickle nobody can reconstruct a decision from.
   */
  async setEntrantAttributes(
    uow: UnitOfWork,
    input: {
      readonly entrantId: string;
      readonly attributes: readonly EntrantAttribute[];
    } & AuditContext,
  ): Promise<readonly EntrantAttribute[]> {
    // Read through the caller's transaction, not the pool: an entrant
    // registered earlier in this same unit of work is not visible outside it,
    // and refusing to attribute one would be a lie about what exists.
    const row = await uow.tx
      .selectFrom('entrants')
      .selectAll()
      .where('entrant_id', '=', input.entrantId)
      .executeTakeFirst();
    if (!row) {
      throw new InvariantViolationError(`Entrant ${input.entrantId} does not exist`, {
        entrantId: input.entrantId,
      });
    }
    const entrant = toEntrant(row);

    const validated = validateAttributes({
      entrantId: input.entrantId,
      attributes: input.attributes,
    });
    if (!validated.ok) throw validated.error;

    const previousRows = await uow.tx
      .selectFrom('entrant_attributes')
      .selectAll()
      .where('entrant_id', '=', input.entrantId)
      .orderBy('key')
      .execute();
    const previous = previousRows.map(toEntrantAttribute);

    await uow.tx
      .deleteFrom('entrant_attributes')
      .where('entrant_id', '=', input.entrantId)
      .execute();

    if (input.attributes.length > 0) {
      await uow.tx
        .insertInto('entrant_attributes')
        .values(
          input.attributes.map((attribute) => ({
            entrant_attribute_id: newId(),
            entrant_id: input.entrantId,
            tournament_id: entrant.tournamentId,
            key: attribute.key,
            kind: attribute.kind,
            value_text: attribute.kind === 'categorical' ? String(attribute.value) : null,
            value_numeric: attribute.kind === 'numeric' ? Number(attribute.value) : null,
            created_at: new Date(),
          })),
        )
        .execute();
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'entrant',
      entityId: input.entrantId,
      action: 'entrant.attributes-set',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { attributes: [...previous] },
      resultingState: { attributes: [...input.attributes] },
    });

    return [...input.attributes];
  }

  /**
   * Applies a computed seed order, recording the mode that produced it.
   *
   * The engine decides the order and this writes it, so the audit trail answers
   * "why is this club on seed 3" with the rule that placed it — a manual
   * placement names the operator who chose it, and a weighted one names the
   * attribute it ranked on. A bracket dispute is otherwise unanswerable.
   */
  async setEntrantSeeds(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly placements: readonly SeedPlacement[];
      readonly allocation: StageAllocation;
      /**
       * Seed of the draw that produced this order, when one did. Recorded so
       * the draw can be replayed and audited — a draw nobody can reproduce is a
       * draw nobody can check.
       */
      readonly drawSeed?: number;
    } & AuditContext,
  ): Promise<readonly Entrant[]> {
    const knownRows = await uow.tx
      .selectFrom('entrants')
      .selectAll()
      .where('tournament_id', '=', input.tournamentId)
      .orderBy('created_at')
      .execute();
    const known = knownRows.map(toEntrant);
    const byId = new Map(known.map((entrant) => [entrant.entrantId, entrant]));

    for (const placement of input.placements) {
      if (!byId.has(placement.entrantId)) {
        throw new InvariantViolationError(
          `Entrant ${placement.entrantId} is not registered in tournament ${input.tournamentId}`,
          { entrantId: placement.entrantId, tournamentId: input.tournamentId },
        );
      }
    }

    const updated: Entrant[] = [];
    for (const placement of input.placements) {
      const row = await uow.tx
        .updateTable('entrants')
        .set({ seed: placement.seed })
        .where('entrant_id', '=', placement.entrantId)
        .returningAll()
        .executeTakeFirstOrThrow();
      updated.push(toEntrant(row));
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'entrants.seeded',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: {
        seeds: known.map((entrant) => ({
          entrantId: entrant.entrantId,
          seed: entrant.seed ?? null,
        })),
      },
      resultingState: {
        allocation: { ...input.allocation },
        seeds: [...input.placements],
        ...(input.drawSeed === undefined ? {} : { drawSeed: input.drawSeed }),
      },
    });

    return updated;
  }

  async listEntrantAttributes(entrantId: string): Promise<readonly EntrantAttribute[]> {
    const rows = await this.db
      .selectFrom('entrant_attributes')
      .selectAll()
      .where('entrant_id', '=', entrantId)
      .orderBy('key')
      .execute();
    return rows.map(toEntrantAttribute);
  }

  /** Every entrant's attributes in one tournament, keyed by entrant id. */
  async listTournamentAttributes(
    tournamentId: string,
  ): Promise<ReadonlyMap<string, readonly EntrantAttribute[]>> {
    const rows = await this.db
      .selectFrom('entrant_attributes')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('entrant_id')
      .orderBy('key')
      .execute();

    const byEntrant = new Map<string, EntrantAttribute[]>();
    for (const row of rows) {
      const list = byEntrant.get(row.entrant_id) ?? [];
      list.push(toEntrantAttribute(row));
      byEntrant.set(row.entrant_id, list);
    }
    return byEntrant;
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

  /** Entrants owned by one participant, never a whole tournament's registration list. */
  async listParticipantEntrants(
    organizationId: string,
    personId: string,
  ): Promise<readonly Entrant[]> {
    const rows = await this.db
      .selectFrom('entrants')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'entrants.tournament_id')
      .selectAll('entrants')
      .where('tournaments.organization_id', '=', organizationId)
      .where('entrants.person_id', '=', personId)
      .orderBy('entrants.created_at')
      .execute();
    return rows.map(toEntrant);
  }

  /** Team memberships are the participant's readable membership projection. */
  async listParticipantTeamMemberships(
    organizationId: string,
    personId: string,
  ): Promise<readonly ParticipantTeamMembership[]> {
    const rows = await this.db
      .selectFrom('players')
      .innerJoin('teams', 'teams.team_id', 'players.team_id')
      .select([
        'players.player_id as player_id',
        'players.team_id as team_id',
        'players.role as role',
        'teams.name as team_name',
      ])
      .where('players.person_id', '=', personId)
      .where('teams.organization_id', '=', organizationId)
      .orderBy('teams.name')
      .execute();
    return rows.map((row) => ({
      playerId: row.player_id,
      teamId: row.team_id,
      teamName: row.team_name,
      role: row.role,
    }));
  }

  /** Published match results for this participant's individual registrations. */
  async listParticipantReportedResults(
    organizationId: string,
    personId: string,
  ): Promise<readonly ParticipantReportedResult[]> {
    const entrants = await this.listParticipantEntrants(organizationId, personId);
    const results: ParticipantReportedResult[] = [];
    for (const entrant of entrants) {
      const rows = await this.db
        .selectFrom('fixtures')
        .innerJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
        .select(['matches.match_id', 'matches.status', 'matches.result'])
        .where((eb) =>
          eb.or([
            eb('fixtures.home_entrant_id', '=', entrant.entrantId),
            eb('fixtures.away_entrant_id', '=', entrant.entrantId),
          ]),
        )
        .where('matches.result', 'is not', null)
        .orderBy('matches.created_at')
        .execute();
      results.push(
        ...rows.map((row) => ({
          matchId: row.match_id,
          entrantId: entrant.entrantId,
          status: row.status,
          result: row.result,
        })),
      );
    }
    return results;
  }
}

/**
 * Refuses a malformed abbreviation before any SQL runs.
 *
 * A check constraint could enforce the shape, and its error would say
 * `violates check constraint "teams_abbreviation"`. The organizer needs to know
 * that lowercase is not allowed and why, which is what the value object says.
 */
function assertAbbreviation(value: string | undefined): void {
  if (value === undefined) return;
  const abbreviation = Abbreviation.create(value);
  if (!abbreviation.ok) {
    throw new InvariantViolationError(abbreviation.error.message, { abbreviation: value });
  }
}

/** Refuses a malformed alias with the reason, rather than with a unique-index error. */
function assertAlias(value: string | undefined): void {
  if (value === undefined) return;
  const alias = Alias.create('participant', value);
  if (!alias.ok) {
    throw new InvariantViolationError(alias.error.message, { alias: value });
  }
}

function nextAlias(prefix: string, aliases: readonly string[]): string {
  let ordinal = 1;
  while (aliases.includes(`${prefix}-${ordinal}`)) ordinal += 1;
  return `${prefix}-${ordinal}`;
}
