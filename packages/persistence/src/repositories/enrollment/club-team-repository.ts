import {
  suggestAvailableAlias,
  suggestRequiredClubAlias,
  type Club,
  type Team,
} from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import { InvariantViolationError } from '../../errors.js';
import { newId } from '../../ids.js';
import { toClub, toTeam } from '../../mapping.js';
import { AliasRepository } from '../alias-repository.js';
import type { Database } from '../../schema.js';
import type { EventOrigin } from '../../outbox.js';
import type { UnitOfWork } from '../../transaction.js';
import {
  type AuditContext,
  assertAbbreviation,
  assertClubAlias,
  assertEntrantAlias,
  nextAlias,
} from './enrollment-support.js';

/** Clubs, teams and their aliases. */
export class ClubTeamRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Creates a club.
   *
   * The table has existed with nothing to write to it — clubs
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
      readonly origin?: EventOrigin;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Club> {
    assertAbbreviation(input.abbreviation);

    // A given alias is validated; an absent one is suggested from the name and
    // disambiguated against what this organization already uses. Two clubs
    // named "Talleres" is ordinary, and making the second one's organizer
    // invent a suffix by hand is not. Every club carries an alias, so a name
    // with nothing to fold falls back to the abbreviation, then `club-<n>`.
    const alias =
      input.alias ??
      (await this.suggestClubAlias(input.organizationId, input.name, input.abbreviation));
    assertClubAlias(alias);
    // Only an explicit alias can collide: a suggestion is already disambiguated. A former alias
    // does not block an explicit one, because a current alias always wins.
    if (input.alias !== undefined) {
      await this.assertClubAliasFree(uow.tx, input.organizationId, alias);
    }

    const clubId = newId();
    const row = await uow.tx
      .insertInto('clubs')
      .values({
        club_id: clubId,
        organization_id: input.organizationId,
        alias,
        name: input.name,
        abbreviation: input.abbreviation ?? null,
        emblem_object_id: null,
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
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `club:${clubId}`,
      entityId: clubId,
      eventType: 'club.created',
      projectionVersion: 1,
      payload: {
        clubId,
        alias: club.alias,
        name: club.name,
        actor: input.actor,
        ...(input.origin === undefined ? {} : { origin: input.origin }),
      },
    });
    return club;
  }

  /**
   * The alias this organization would give a club of this name.
   *
   * Exposed so a console can show it in the form *before* anything is created —
   * a suggestion the organizer never sees is a derivation, and this capability
   * derives a URL, not a name. Never empty.
   */
  async suggestClubAlias(
    organizationId: string,
    name: string,
    abbreviation?: string,
  ): Promise<string> {
    const rows = await this.db
      .selectFrom('clubs')
      .select('alias')
      .where('organization_id', '=', organizationId)
      .where('alias', 'is not', null)
      .execute();
    // A former alias still has inbound links; a suggestion must not hand it to another club.
    const formerAliases = await this.db
      .selectFrom('alias_redirects')
      .select('old_alias')
      .where('organization_id', '=', organizationId)
      .where('scope', '=', 'club')
      .execute();

    return suggestRequiredClubAlias(
      name,
      [
        ...rows.flatMap((row) => (row.alias === null ? [] : [row.alias])),
        ...formerAliases.map((row) => row.old_alias),
      ],
      abbreviation,
    );
  }

  /** The club of this organization that holds `alias` as its current alias, if any. */
  async findClubByAlias(
    executor: Kysely<Database> | Transaction<Database>,
    organizationId: string,
    alias: string,
  ): Promise<Club | undefined> {
    const row = await executor
      .selectFrom('clubs')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('alias', '=', alias)
      .executeTakeFirst();
    return row ? toClub(row) : undefined;
  }

  /** Refuses an explicit club alias another club of the organization already holds. */
  async assertClubAliasFree(
    executor: Kysely<Database> | Transaction<Database>,
    organizationId: string,
    alias: string,
    clubId?: string,
  ): Promise<void> {
    const claimed = await this.findClubByAlias(executor, organizationId, alias);
    if (claimed && claimed.clubId !== clubId) {
      throw new InvariantViolationError('Another club already uses this alias', {
        alias,
        conflictsWith: claimed.clubId,
      });
    }
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
      readonly emblemObjectId?: string;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Club> {
    if (input.abbreviation !== null) assertAbbreviation(input.abbreviation);
    assertClubAlias(input.alias);
    if (input.alias !== undefined) {
      await this.assertClubAliasFree(uow.tx, input.organizationId, input.alias, input.clubId);
    }

    const previous = await this.findClub(input.clubId);
    const row = await uow.tx
      .updateTable('clubs')
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.alias === undefined ? {} : { alias: input.alias }),
        ...(input.abbreviation === undefined ? {} : { abbreviation: input.abbreviation }),
        ...(input.emblemObjectId === undefined ? {} : { emblem_object_id: input.emblemObjectId }),
      })
      .where('club_id', '=', input.clubId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const club = toClub(row);
    // Only a change from one alias to another is a rename: a club given its first alias had no URL
    // to preserve, and saving the same alias changes nothing a visitor holds.
    if (
      previous?.alias !== undefined &&
      input.alias !== undefined &&
      input.alias !== previous.alias
    ) {
      await new AliasRepository(this.db).recordRename(uow, {
        organizationId: input.organizationId,
        scope: 'club',
        oldAlias: previous.alias,
        newAlias: input.alias,
        actor: input.actor,
        authorizationContext: input.authorizationContext,
      });
    }
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

  /** Every club of an organization, for a management screen listing. */
  async listClubs(organizationId: string): Promise<readonly Club[]> {
    const rows = await this.db
      .selectFrom('clubs')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('name')
      .execute();
    return rows.map(toClub);
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
    const alias =
      input.alias ?? (await this.suggestTeamAlias(uow.tx, input.organizationId, input.name));
    assertEntrantAlias(alias);
    // Only reachable with an explicit alias: a suggested one is already
    // disambiguated against every alias this organization holds.
    if (input.alias !== undefined) {
      const claimed = await this.findTeamByAlias(input.organizationId, alias);
      if (claimed) {
        throw new InvariantViolationError('Another team already uses this alias', {
          alias,
          conflictsWith: claimed.teamId,
        });
      }
    }

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
      readonly alias?: string;
      readonly abbreviation?: string | null;
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Team> {
    if (input.abbreviation !== null) assertAbbreviation(input.abbreviation);
    if (input.alias !== undefined) {
      assertEntrantAlias(input.alias);
      const claimed = await this.findTeamByAlias(input.organizationId, input.alias);
      if (claimed && claimed.teamId !== input.teamId) {
        throw new InvariantViolationError('Another team already uses this alias', {
          alias: input.alias,
          conflictsWith: claimed.teamId,
        });
      }
    }

    const previous = await this.findTeam(input.teamId);
    const row = await uow.tx
      .updateTable('teams')
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.alias === undefined ? {} : { alias: input.alias }),
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

  /**
   * Removes a team that has never been used for anything — no entrant
   * registration, no rostered player. Either reference refuses the removal
   * by name, an up-front check rather than a caught foreign-key-violation
   * error (mirroring `PersonRepository.remove`). Requires the
   * caller to have already confirmed the team exists and belongs to this
   * organization, matching `updateTeam`'s own contract.
   */
  async removeTeam(
    uow: UnitOfWork,
    input: { readonly teamId: string } & AuditContext,
  ): Promise<void> {
    const entrant = await uow.tx
      .selectFrom('entrants')
      .innerJoin('tournaments', 'tournaments.tournament_id', 'entrants.tournament_id')
      .select('tournaments.name as tournament_name')
      .where('entrants.team_id', '=', input.teamId)
      .limit(1)
      .executeTakeFirst();
    if (entrant) {
      throw new InvariantViolationError(
        `Cannot remove: registered as an entrant in "${entrant.tournament_name}"`,
        { teamId: input.teamId, reason: 'entrant-registration' },
      );
    }

    const player = await uow.tx
      .selectFrom('players')
      .select('player_id')
      .where('team_id', '=', input.teamId)
      .limit(1)
      .executeTakeFirst();
    if (player) {
      throw new InvariantViolationError('Cannot remove: has a player on its roster', {
        teamId: input.teamId,
        reason: 'roster-membership',
      });
    }

    const deleted = await uow.tx
      .deleteFrom('teams')
      .where('team_id', '=', input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'team',
      entityId: input.teamId,
      action: 'team.removed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toTeam(deleted) },
    });
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

  /** Every team belonging to one club — the Club Portal's team picker. */
  async listTeamsByClub(organizationId: string, clubId: string): Promise<readonly Team[]> {
    const rows = await this.db
      .selectFrom('teams')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('club_id', '=', clubId)
      .orderBy('name')
      .execute();
    return rows.map(toTeam);
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

  /**
   * The aliases a `team-membership` CSV import may reference: only
   * teams already registered as entrants in this tournament, never every team
   * in the organization. A team-membership row names a team that already
   * exists in the draw — this is what a worker resolves before validation, so
   * an unregistered reference is a row-level preview error, not a silent
   * create.
   */
  async listRegisteredTeamAliases(tournamentId: string): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('entrants')
      .innerJoin('teams', 'teams.team_id', 'entrants.team_id')
      .select('teams.alias as alias')
      .where('entrants.tournament_id', '=', tournamentId)
      .where('teams.alias', 'is not', null)
      .execute();
    return rows.flatMap((row) => (row.alias === null ? [] : [row.alias]));
  }

  /**
   * Reads through the caller's own executor rather than `this.db`: called
   * from inside `createTeam`'s open transaction, and a second connection
   * acquisition against the same underlying connection deadlocks under
   * SQLite's single-connection test dialect (`createRuleset` fix is
   * the same bug, same reason).
   */
  async suggestTeamAlias(
    executor: Kysely<Database> | Transaction<Database>,
    organizationId: string,
    name: string,
  ): Promise<string> {
    const rows = await executor
      .selectFrom('teams')
      .select('alias')
      .where('organization_id', '=', organizationId)
      .where('alias', 'is not', null)
      .execute();
    const aliases = rows.flatMap((row) => (row.alias === null ? [] : [row.alias]));
    return suggestAvailableAlias(name, aliases) ?? nextAlias('team', aliases);
  }
}
