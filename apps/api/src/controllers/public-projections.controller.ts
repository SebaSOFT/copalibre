import { Controller, Get, Param, NotFoundException, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import {
  Database,
  TournamentRepository,
  EnrollmentRepository,
  CompetitionRepository,
  withTransaction,
  StageReadModel,
  PublicOverviewReadModel,
} from '@copalibre/persistence';
import {
  PublicOverviewResponse,
  PublicLiveResponse,
  PublicBracketResponse,
  PublicOverviewMatchResponse,
} from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';
import { readStandings } from '../standings/read.js';

import { toBracketMatch, ambiguousRoundPositions } from './seeding.controller.js';
import { generateFixtures } from '@copalibre/tournament-engine';

@ApiTags('Public Projections')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias')
export class PublicProjectionsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  private async resolvePublishedTournament(organizationAlias: string, tournamentAlias: string) {
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament || tournament.status === 'draft') {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
      );
    }
    const organization = await this.db
      .selectFrom('organizations')
      .select('name')
      .where('organization_id', '=', tournament.organizationId)
      .executeTakeFirst();
    if (!organization) throw new NotFoundException();

    return { tournament, organizationName: organization.name };
  }

  @Get('overview')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Overview of a tournament' })
  @ApiOkResponse({ type: PublicOverviewResponse })
  async overview(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<PublicOverviewResponse> {
    const { tournament, organizationName } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const season = await withTransaction(this.db, (uow) =>
      new CompetitionRepository(this.db).currentSeason(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: tournament.organizationId,
        actor: 'system',
        authorizationContext: '',
      }),
    );

    const matches = await new PublicOverviewReadModel(this.db).matchesForTournament(
      tournament.tournamentId,
    );

    const entrantIds = new Set<string>();
    for (const match of matches) {
      if (match.homeEntrantId) entrantIds.add(match.homeEntrantId);
      if (match.awayEntrantId) entrantIds.add(match.awayEntrantId);
    }
    const names = await new EnrollmentRepository(this.db).resolveEntrantNames(
      Array.from(entrantIds),
    );

    const rulesetData = await new TournamentRepository(this.db).findLatestRuleset(
      tournament.tournamentId,
    );
    const ruleset: Record<string, string> = {};
    if (rulesetData) {
      for (const [k, v] of Object.entries(rulesetData.overrides)) {
        ruleset[k] = String(v);
      }
    }

    const stages = await new CompetitionRepository(this.db).listStages(season.seasonId);
    let standingsPreview: PublicOverviewResponse['standingsPreview'] = undefined;
    if (stages.length > 0) {
      const stage = stages[0];
      if (stage) {
        const standings = await readStandings(this.db, tournament, stage.number);

        const standingsEntrantIds = standings.rows.map((r) => r.entrantId);
        const standingsNames = await new EnrollmentRepository(this.db).resolveEntrantNames(
          standingsEntrantIds,
        );

        standingsPreview = standings.rows.map((r) => ({
          rank: r.rank,
          entrantId: r.entrantId,
          name: standingsNames.get(r.entrantId)?.name ?? 'Unknown',
          abbreviation: standingsNames.get(r.entrantId)?.abbreviation,
          sharedRank: r.sharedRank,
          statistics: r.statistics,
        }));
      }
    }

    return {
      organizationAlias,
      organizationName,
      tournamentAlias,
      tournamentName: tournament.name,
      seasonName: season.name,
      matches: matches.map((m) => ({
        matchId: m.matchId,
        stageNumber: m.stageNumber,
        round: m.round,
        status: m.status as PublicOverviewMatchResponse['status'],
        homeEntrantId: m.homeEntrantId ?? undefined,
        homeName: m.homeEntrantId ? (names.get(m.homeEntrantId)?.name ?? 'Unknown') : undefined,
        homeAbbreviation: m.homeEntrantId ? names.get(m.homeEntrantId)?.abbreviation : undefined,
        awayEntrantId: m.awayEntrantId ?? undefined,
        awayName: m.awayEntrantId ? (names.get(m.awayEntrantId)?.name ?? 'Unknown') : undefined,
        awayAbbreviation: m.awayEntrantId ? names.get(m.awayEntrantId)?.abbreviation : undefined,
        homeScore: m.scores?.[0],
        awayScore: m.scores?.[1],
        scheduledAt: m.scheduledAt,
      })),
      standingsPreview,
      ruleset,
    };
  }

  @Get('live')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Live matches of a tournament' })
  @ApiOkResponse({ type: PublicLiveResponse })
  async live(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<PublicLiveResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const matches = await new PublicOverviewReadModel(this.db).matchesForTournament(
      tournament.tournamentId,
    );
    const liveMatches = matches.filter((m) => m.status === 'in_progress');

    const entrantIds = new Set<string>();
    for (const match of liveMatches) {
      if (match.homeEntrantId) entrantIds.add(match.homeEntrantId);
      if (match.awayEntrantId) entrantIds.add(match.awayEntrantId);
    }
    const names = await new EnrollmentRepository(this.db).resolveEntrantNames(
      Array.from(entrantIds),
    );

    return {
      matches: liveMatches.map((m) => ({
        matchId: m.matchId,
        matchNumber: m.round,
        state: 'in_progress',
        projectionVersion: 1,
        sides: [
          ...(m.homeEntrantId
            ? [
                {
                  entrantId: m.homeEntrantId,
                  name: names.get(m.homeEntrantId)?.name ?? 'Unknown',
                  abbreviation: names.get(m.homeEntrantId)?.abbreviation,
                  score: m.scores?.[0] ?? 0,
                },
              ]
            : []),
          ...(m.awayEntrantId
            ? [
                {
                  entrantId: m.awayEntrantId,
                  name: names.get(m.awayEntrantId)?.name ?? 'Unknown',
                  abbreviation: names.get(m.awayEntrantId)?.abbreviation,
                  score: m.scores?.[1] ?? 0,
                },
              ]
            : []),
        ],
      })),
    };
  }

  @Get('stages/:stageNumber/bracket')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Bracket for a stage' })
  @ApiOkResponse({ type: PublicBracketResponse })
  async bracket(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberStr: string,
  ): Promise<PublicBracketResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const stageNumber = parseInt(stageNumberStr, 10);

    const compRepo = new CompetitionRepository(this.db);
    const season = await withTransaction(this.db, (uow) =>
      compRepo.currentSeason(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: tournament.organizationId,
        actor: 'system',
        authorizationContext: '',
      }),
    );
    const stages = await compRepo.listStages(season.seasonId);
    const stage = stages.find((s) => s.number === stageNumber);
    if (!stage) throw new NotFoundException();

    const stageMatchesMapped = await new StageReadModel(this.db).matches(stage.stageId);

    const generated = generateFixtures({
      format: stage.format as Parameters<typeof generateFixtures>[0]['format'],
      entrants: [],
    });
    if (!generated.ok) {
      return { matches: [] };
    }
    const graph = generated.value;

    const ambiguous = ambiguousRoundPositions(graph.matches);

    const bracketMatches = graph.matches.map((match) =>
      toBracketMatch(match, stageMatchesMapped, {
        ambiguousPositions: ambiguous,
        matchFormat: undefined,
      }),
    );

    const entrantIds = new Set<string>();
    for (const match of bracketMatches) {
      for (const slot of match.slots) {
        if (slot.entrantId) entrantIds.add(slot.entrantId);
      }
    }
    const names = await new EnrollmentRepository(this.db).resolveEntrantNames(
      Array.from(entrantIds),
    );

    return {
      matches: bracketMatches.map((m) => ({
        matchId: m.matchId,
        bracket: m.bracket,
        round: m.round,
        position: m.position,
        status: m.status,
        format: m.format,
        slots: m.slots.map((s) => ({
          kind: s.kind,
          entrantId: s.entrantId,
          name: s.entrantId ? (names.get(s.entrantId)?.name ?? 'Unknown') : undefined,
          abbreviation: s.entrantId ? names.get(s.entrantId)?.abbreviation : undefined,
          matchId: s.matchId,
          score: s.score,
        })),
      })),
    };
  }
}
