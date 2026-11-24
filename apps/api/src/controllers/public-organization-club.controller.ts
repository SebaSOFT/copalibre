import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { deriveTournamentStatus } from '@copalibre/domain';
import {
  AliasRepository,
  type Database,
  PublicOverviewReadModel,
  TournamentRepository,
} from '@copalibre/persistence';
import { Kysely } from 'kysely';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import {
  PublicOrganizationClubHistoryResponse,
  type PublicOrganizationClubTournamentResponse,
} from '../dto/public-tournament.dto.js';
import { NotFoundException } from '../http/error-contract.js';
import {
  disciplineSummaryOf,
  loadDescriptorsById,
} from '../organization-club/discipline-summary.js';
import { clubPlacements } from '../organization-club/placements.js';
import { resolveTournamentWinners } from './public-projections.controller.js';

/**
 * A club across its organization's published tournaments: the tournaments it entered a team in and
 * the podium places it won. Everything here is already public on each tournament's own pages.
 */
@ApiTags('Public Projections')
@Controller('organizations/:organizationAlias/public/clubs')
export class PublicOrganizationClubController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get(':clubAlias')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: "A club's tournaments and podium places in its organization",
    description:
      'A former alias of a renamed club answers with that club, whose `club.alias` is the current one.',
  })
  @ApiOkResponse({ type: PublicOrganizationClubHistoryResponse })
  async clubHistory(
    @Param('organizationAlias') organizationAlias: string,
    @Param('clubAlias') clubAlias: string,
  ): Promise<PublicOrganizationClubHistoryResponse> {
    const organization = await this.db
      .selectFrom('organizations')
      .select(['organization_id as organizationId', 'name', 'alias', 'emblem_object_id'])
      .where('alias', '=', organizationAlias)
      .executeTakeFirst();
    const club = organization
      ? await this.findClub(organization.organizationId, clubAlias)
      : undefined;
    if (!organization || !club || club.alias === null) {
      throw new NotFoundException(`No club "${clubAlias}" in organization "${organizationAlias}"`, {
        errorCode: 'public-projection-not-found',
      });
    }

    return {
      organizationAlias: organization.alias,
      organizationName: organization.name,
      ...(organization.emblem_object_id
        ? { organizationEmblemObjectId: organization.emblem_object_id }
        : {}),
      club: {
        clubId: club.club_id,
        name: club.name,
        alias: club.alias,
        ...(club.abbreviation ? { abbreviation: club.abbreviation } : {}),
        ...(club.emblem_object_id ? { emblemObjectId: club.emblem_object_id } : {}),
      },
      tournaments: await this.tournamentsOf(organization.organizationId, club.club_id),
    };
  }

  /**
   * The club holding this alias today or, failing that, the club that held it before a rename. The
   * response then carries the current alias, so the page can move the visitor to it.
   */
  private async findClub(organizationId: string, clubAlias: string) {
    const byAlias = (alias: string) =>
      this.db
        .selectFrom('clubs')
        .selectAll()
        .where('organization_id', '=', organizationId)
        .where('alias', '=', alias)
        .executeTakeFirst();
    const current = await byAlias(clubAlias);
    if (current) return current;
    const resolution = await new AliasRepository(this.db).resolveClubAlias(
      organizationId,
      clubAlias,
    );
    return resolution.kind === 'redirect' ? byAlias(resolution.to) : undefined;
  }

  /** Published tournaments with a team entrant from the club, in the listing's newest-first order. */
  private async tournamentsOf(
    organizationId: string,
    clubId: string,
  ): Promise<PublicOrganizationClubTournamentResponse[]> {
    const published = await new TournamentRepository(this.db).listPublishedByOrganization(
      organizationId,
    );
    if (published.length === 0) return [];

    // Team entrants only, the rule every public club surface follows: a person whose team belongs
    // to the club does not put the club in the tournament.
    const entered = await this.db
      .selectFrom('entrants')
      .innerJoin('teams', 'teams.team_id', 'entrants.team_id')
      .select('entrants.tournament_id as tournamentId')
      .where('teams.club_id', '=', clubId)
      .where(
        'entrants.tournament_id',
        'in',
        published.map((tournament) => tournament.tournamentId),
      )
      .distinct()
      .execute();
    const enteredIds = new Set(entered.map((row) => row.tournamentId));
    const tournaments = published.filter((tournament) => enteredIds.has(tournament.tournamentId));
    if (tournaments.length === 0) return [];

    const descriptors = await loadDescriptorsById(this.db);
    const readModel = new PublicOverviewReadModel(this.db);
    const entries: PublicOrganizationClubTournamentResponse[] = [];
    for (const tournament of tournaments) {
      const matches = await readModel.matchesForTournament(tournament.tournamentId);
      const status = deriveTournamentStatus(tournament.status, matches);
      const placements =
        status === 'finished'
          ? clubPlacements(await resolveTournamentWinners(this.db, tournament), clubId)
          : [];
      entries.push({
        alias: tournament.alias,
        name: tournament.name,
        status,
        discipline: disciplineSummaryOf(
          tournament.disciplineRef,
          descriptors.get(tournament.disciplineRef.descriptorId),
        ),
        ...(tournament.startedAt || tournament.archivedAt
          ? {
              dates: {
                ...(tournament.startedAt ? { startedAt: tournament.startedAt } : {}),
                ...(tournament.archivedAt ? { archivedAt: tournament.archivedAt } : {}),
              },
            }
          : {}),
        ...(tournament.emblemObjectId ? { emblemObjectId: tournament.emblemObjectId } : {}),
        ...(placements.length > 0 ? { placements } : {}),
      });
    }
    return entries;
  }
}
