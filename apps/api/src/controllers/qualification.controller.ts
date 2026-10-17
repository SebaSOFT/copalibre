import { Body, Controller, HttpCode, Inject, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CompetitionRepository,
  lockRowsForMutation,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import {
  ConfirmQualificationRequest,
  ConfirmQualificationResponse,
  QualificationPreviewResponse,
} from '../dto/qualification.dto.js';
import { ConflictException, NotFoundException } from '../http/error-contract.js';
import { zoneEntrantResolution } from '../zone-entrant-resolution.js';
import { evaluateQualification, requirePlans } from './qualification.js';
import { stageQualifierPlans } from './stage-qualifiers.js';
import { resolveTournament } from './standings.controller.js';

/**
 * Confirming who qualified into a stage generated ahead. Completing the prior stage fills nothing
 * by itself: an organizer previews each qualifier position's entrant and confirms them together.
 */
@ApiTags('zones and groups')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/stages/:stageNumber')
export class QualificationController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post('qualification/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Preview who each qualifier position of a stage resolves to, without writing',
  })
  @ApiOkResponse({ type: QualificationPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async preview(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<QualificationPreviewResponse> {
    const { tournament, stageId } = await this.stage(
      organizationAlias,
      tournamentAlias,
      stageNumber,
      request,
    );
    const plans = requirePlans(await stageQualifierPlans(this.db, stageId), stageNumber);
    return (await evaluateQualification(this.db, tournament, plans)).preview;
  }

  @Post('qualification/confirm')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm the qualification of a stage generated ahead',
    description:
      'Re-evaluates every plan inside one transaction, stores each confirmed position → entrant ' +
      'map, and resolves every qualifier side through the audited entrant writer. Refused while ' +
      'the prior stage is incomplete, while a cut line is tied, or when `expected` no longer ' +
      'matches the standings.',
  })
  @ApiOkResponse({ type: ConfirmQualificationResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async confirm(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: ConfirmQualificationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ConfirmQualificationResponse> {
    const { tournament, stageId, organizationId } = await this.stage(
      organizationAlias,
      tournamentAlias,
      stageNumber,
      request,
    );
    const audit = {
      organizationId,
      actor: `user:${request.subject?.principalId ?? request.subject?.subjectId ?? 'unknown'}`,
      authorizationContext: (request.subject?.scopes ?? []).join(' '),
    };

    const changedSides = await withTransaction(this.db, async (uow) => {
      const plans = requirePlans(await stageQualifierPlans(uow.tx, stageId), stageNumber);
      // A result finalized between preview and confirm waits on these locks, so the standings
      // evaluated below are the ones this confirmation commits.
      await lockRowsForMutation(
        this.db,
        uow.tx
          .selectFrom('matches')
          .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
          .select('matches.match_id')
          .where('fixtures.stage_id', 'in', [
            ...new Set(plans.map((plan) => plan.sourceZone.stageId)),
          ])
          .orderBy('matches.match_id'),
      ).execute();
      const { preview, resolutions } = await evaluateQualification(uow.tx, tournament, plans);
      if (preview.state === 'incomplete') {
        throw new ConflictException(
          {
            message: `The prior stage has ${preview.incomplete.length} unresolved match(es)`,
            incomplete: preview.incomplete,
          },
          { errorCode: 'qualification-stage-incomplete' },
        );
      }
      if (preview.state === 'tied' && preview.tie !== undefined) {
        throw new ConflictException(
          {
            message: 'A tie at a cut line is unresolved',
            tie: preview.tie,
            names: preview.names,
          },
          { errorCode: 'qualification-tie-unresolved' },
        );
      }
      const moved = (body.expected ?? []).filter(
        (expected) =>
          resolutions.get(expected.promotionPlanId)?.[String(expected.position)] !==
          expected.entrantId,
      );
      if (moved.length > 0) {
        throw new ConflictException(
          {
            message: 'The standings changed since the preview; review the qualification again',
            positions: moved.map(({ promotionPlanId, position }) => ({
              promotionPlanId,
              position,
            })),
          },
          { errorCode: 'qualification-preview-stale' },
        );
      }

      const competition = new CompetitionRepository(this.db);
      for (const plan of plans) {
        const resolution = resolutions.get(plan.promotionPlanId);
        if (resolution === undefined) continue;
        await competition.confirmPromotionPlan(uow, {
          promotionPlanId: plan.promotionPlanId,
          resolution,
          ...audit,
        });
      }
      const zoneIds = await uow.tx
        .selectFrom('fixtures')
        .select('zone_id')
        .distinct()
        .where('stage_id', '=', stageId)
        .where('zone_id', 'is not', null)
        .execute();
      let changed = 0;
      for (const { zone_id: zoneId } of zoneIds) {
        if (zoneId === null) continue;
        const outcome = await zoneEntrantResolution(this.db).run(uow, zoneId, audit);
        changed += outcome.changedSides;
      }
      return changed;
    });

    const plans = await stageQualifierPlans(this.db, stageId);
    const { preview } = await evaluateQualification(this.db, tournament, plans);
    return { ...preview, changedSides };
  }

  private async stage(
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
    request: RequestWithSubject,
  ) {
    const { organizationId, tournament } = await resolveTournament(this.db, {
      organizationAlias,
      tournamentAlias,
      request,
    });
    const stage = (
      await new CompetitionRepository(this.db).listStagesOfTournament(tournament.tournamentId)
    ).find((candidate) => candidate.number === stageNumber);
    if (!stage)
      throw new NotFoundException(`No stage ${stageNumber}`, { errorCode: 'zone-group-not-found' });
    return {
      organizationId,
      tournament: {
        tournamentId: tournament.tournamentId,
        disciplineRef: tournament.disciplineRef,
      },
      stageId: stage.stageId,
    };
  }
}
