import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IMPLICIT_ZONE_NAME, type DrawConstraint } from '@copalibre/domain';
import {
  computeAccounting,
  drawGroups,
  drawZones,
  evaluateGroupPromotion,
  QualificationError,
  validatePromotionPlan,
  type PromotionPlan,
} from '@copalibre/tournament-engine';
import {
  CompetitionRepository,
  EnrollmentRepository,
  InvariantViolationError,
  StageReadModel,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { RequireOrganizationRole } from '../auth/access-requirement.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import {
  ConfirmGroupDrawResponse,
  ConfirmZoneDrawResponse,
  CreateGroupRequest,
  CreateZoneRequest,
  DrawGroupsRequest,
  DrawPreviewResponse,
  DrawZonesRequest,
  GroupResponse,
  ManualGroupAssignmentRequest,
  ManualGroupAssignmentResponse,
  ManualZoneAssignmentRequest,
  ManualZoneAssignmentResponse,
  PromotionPlanResponse,
  PromotionPreviewResponse,
  SavePromotionPlanRequest,
  TargetingPromotionPreviewResponse,
  ZoneResponse,
} from '../dto/zones-groups.dto.js';
import { resolveTournament } from './standings.controller.js';
import { standingsPipeline } from '../standings/pipeline.js';
import { readStageSeries } from './stage-series.js';

@ApiTags('zones and groups')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/stages/:stageNumber')
export class ZonesGroupsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('zones')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'List a stage’s zones' })
  @ApiOkResponse({ type: ZoneResponse, isArray: true })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async listZones(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
  ): Promise<readonly ZoneResponse[]> {
    const { stage } = await this.publicStage(organizationAlias, tournamentAlias, stageNumber);
    return new CompetitionRepository(this.db).listZonesOfStage(stage.stageId);
  }

  @Post('zones')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a manually named zone before fixture generation' })
  @ApiCreatedResponse({ type: ZoneResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async createZone(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: CreateZoneRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ZoneResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const competition = new CompetitionRepository(this.db);
    const existing = await competition.listZonesOfStage(context.stage.stageId);
    const number = body.number ?? existing.length + 1;
    try {
      return await withTransaction(this.db, (uow) =>
        competition.createZone(uow, {
          stageId: context.stage.stageId,
          number,
          name: body.name,
          ...context.audit,
        }),
      );
    } catch (error) {
      throwConflict(error);
    }
  }

  @Get('zones/:zoneNumber/entrants')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'List the entrant ids assigned to a zone' })
  @ApiOkResponse({ type: String, isArray: true })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async zoneEntrants(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
  ): Promise<readonly string[]> {
    const { stage } = await this.publicStage(organizationAlias, tournamentAlias, stageNumber);
    const zone = await this.zone(stage.stageId, zoneNumber);
    return new CompetitionRepository(this.db).listEntrantIdsOfZone(zone.zoneId);
  }

  @Get('zones/:zoneNumber/groups')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'List a zone’s groups' })
  @ApiOkResponse({ type: GroupResponse, isArray: true })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async listGroups(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
  ): Promise<readonly GroupResponse[]> {
    const { stage } = await this.publicStage(organizationAlias, tournamentAlias, stageNumber);
    const zone = await this.zone(stage.stageId, zoneNumber);
    return new CompetitionRepository(this.db).listGroupsOfZone(zone.zoneId);
  }

  @Post('zones/:zoneNumber/groups')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a manually named group before fixture generation' })
  @ApiCreatedResponse({ type: GroupResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async createGroup(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Body() body: CreateGroupRequest,
    @Req() request: RequestWithSubject,
  ): Promise<GroupResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    const competition = new CompetitionRepository(this.db);
    const existing = await competition.listGroupsOfZone(zone.zoneId);
    const number = body.number ?? existing.length + 1;
    try {
      return await withTransaction(this.db, (uow) =>
        competition.createGroup(uow, {
          zoneId: zone.zoneId,
          number,
          name: body.name,
          ...context.audit,
        }),
      );
    } catch (error) {
      throwConflict(error);
    }
  }

  @Post('zones/draw/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Preview a deterministic zone draw without writing it' })
  @ApiOkResponse({ type: DrawPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewZones(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: DrawZonesRequest,
    @Req() request: RequestWithSubject,
  ): Promise<DrawPreviewResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    return this.zoneDraw(context.tournamentId, body);
  }

  @Post('zones/draw')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm and durably record a deterministic zone draw' })
  @ApiOkResponse({ type: ConfirmZoneDrawResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async confirmZones(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: DrawZonesRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ConfirmZoneDrawResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const outcome = await this.zoneDraw(context.tournamentId, body);
    const competition = new CompetitionRepository(this.db);
    try {
      const persisted = await withTransaction(this.db, (uow) =>
        competition.assignZones(uow, {
          stageId: context.stage.stageId,
          assignment: outcome.assignment,
          constraints: constraintsOf(body.constraints),
          zoneCount: body.zoneCount,
          seed: body.seed,
          ...context.audit,
        }),
      );
      return { ...outcome, zones: [...persisted.entities] };
    } catch (error) {
      throwConflict(error);
    }
  }

  @Post('zones/:zoneNumber/groups/draw/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Preview a deterministic group draw without writing it' })
  @ApiOkResponse({ type: DrawPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewGroups(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Body() body: DrawGroupsRequest,
    @Req() request: RequestWithSubject,
  ): Promise<DrawPreviewResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    return this.groupDraw(context.tournamentId, zone.zoneId, body);
  }

  @Post('zones/:zoneNumber/groups/draw')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm and durably record a deterministic group draw' })
  @ApiOkResponse({ type: ConfirmGroupDrawResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async confirmGroups(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Body() body: DrawGroupsRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ConfirmGroupDrawResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    const outcome = await this.groupDraw(context.tournamentId, zone.zoneId, body);
    const competition = new CompetitionRepository(this.db);
    try {
      const persisted = await withTransaction(this.db, (uow) =>
        competition.assignGroups(uow, {
          zoneId: zone.zoneId,
          assignment: outcome.assignment,
          constraints: constraintsOf(body.constraints),
          groupCount: body.groupCount,
          seed: body.seed,
          ...context.audit,
        }),
      );
      return { ...outcome, groups: [...persisted.entities] };
    } catch (error) {
      throwConflict(error);
    }
  }

  @Post('zones/assign')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually assign entrants to zones, without a draw' })
  @ApiOkResponse({ type: ManualZoneAssignmentResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async assignZonesManually(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: ManualZoneAssignmentRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ManualZoneAssignmentResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const competition = new CompetitionRepository(this.db);
    try {
      const persisted = await withTransaction(this.db, (uow) =>
        competition.assignZonesManually(uow, {
          stageId: context.stage.stageId,
          assignment: body.assignment,
          zoneCount: body.zoneCount,
          ...context.audit,
        }),
      );
      return {
        assignment: assignmentResponse(persisted.assignment),
        zones: [...persisted.entities],
      };
    } catch (error) {
      throwConflict(error);
    }
  }

  @Post('zones/:zoneNumber/groups/assign')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually assign entrants to groups, without a draw' })
  @ApiOkResponse({ type: ManualGroupAssignmentResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async assignGroupsManually(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Body() body: ManualGroupAssignmentRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ManualGroupAssignmentResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    const competition = new CompetitionRepository(this.db);
    try {
      const persisted = await withTransaction(this.db, (uow) =>
        competition.assignGroupsManually(uow, {
          zoneId: zone.zoneId,
          assignment: body.assignment,
          groupCount: body.groupCount,
          ...context.audit,
        }),
      );
      return {
        assignment: assignmentResponse(persisted.assignment),
        groups: [...persisted.entities],
      };
    } catch (error) {
      throwConflict(error);
    }
  }

  @Post('zones/:zoneNumber/promotion-plan')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save a zone promotion plan without seeding its next stage' })
  @ApiCreatedResponse({ type: PromotionPlanResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async savePromotionPlan(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Body() body: SavePromotionPlanRequest,
    @Req() request: RequestWithSubject,
  ): Promise<PromotionPlanResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    const nextStage = await this.stageOf(context.tournamentId, body.nextStageNumber);
    const plan = promotionPlanFromRequest(zone.zoneId, nextStage.stage.stageId, body);
    try {
      await this.validatePromotionPlan(context.stage.stageId, plan);
      return await withTransaction(this.db, (uow) =>
        new CompetitionRepository(this.db).createPromotionPlan(uow, {
          zoneId: zone.zoneId,
          nextStageId: nextStage.stage.stageId,
          plan: plan as unknown as Record<string, unknown>,
          ...context.audit,
        }),
      );
    } catch (error) {
      throwPromotionPlanError(error);
    }
  }

  @Get('zones/:zoneNumber/promotion-preview')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Preview a zone promotion plan without writing or generating fixtures' })
  @ApiOkResponse({ type: PromotionPreviewResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewPromotion(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<PromotionPreviewResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    const competition = new CompetitionRepository(this.db);
    const saved = await competition.findPromotionPlan(zone.zoneId);
    if (!saved)
      throw new NotFoundException(`No promotion plan for zone ${zoneNumber}`, {
        errorCode: 'zone-group-not-found',
      });

    try {
      return await this.computePromotionPreview(
        context.tournamentId,
        context.tournament,
        context.stage.stageId,
        zone,
        saved,
      );
    } catch (error) {
      throwPromotionPlanError(error);
    }
  }

  @Get('promotion-plans')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationRole('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List resolved promotion previews from prior-stage zones targeting this stage',
    description:
      'The reverse of "zones/:zoneNumber/promotion-plan": every zone, in any prior stage, whose ' +
      'stored plan names this stage as its `nextStageNumber`, with its promotion preview already ' +
      'computed and ordered by zone number. A zone whose plan cannot currently be resolved into a ' +
      'preview (e.g. its source group standings are not ready yet) is omitted, not reported as an ' +
      'error — this route never fails for that reason, it simply returns fewer entries.',
  })
  @ApiOkResponse({ type: TargetingPromotionPreviewResponse, isArray: true })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async promotionPlansTargetingStage(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<readonly TargetingPromotionPreviewResponse[]> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const competition = new CompetitionRepository(this.db);
    const saved = await competition.findPromotionPlansTargetingStage(context.stage.stageId);

    const resolved = await Promise.all(
      saved.map(async (plan): Promise<TargetingPromotionPreviewResponse | undefined> => {
        const zone = await competition.findZoneById(plan.zoneId);
        if (!zone) return undefined;
        try {
          const preview = await this.computePromotionPreview(
            context.tournamentId,
            context.tournament,
            zone.stageId,
            zone,
            plan,
          );
          return {
            zoneNumber: zone.number,
            zoneId: zone.zoneId,
            combined: preview.combined,
            ...(preview.bands === undefined ? {} : { bands: preview.bands }),
          };
        } catch {
          // Not yet resolvable (e.g. group standings incomplete) — omitted,
          // not an error for this reverse lookup as a whole (design.md).
          return undefined;
        }
      }),
    );
    return resolved
      .filter((entry): entry is TargetingPromotionPreviewResponse => entry !== undefined)
      .sort((a, b) => a.zoneNumber - b.zoneNumber);
  }

  /**
   * Shared by `previewPromotion` (one zone, the caller already knows) and
   * `promotionPlansTargetingStage` (many zones discovered by reverse
   * lookup) — `sourceStageId` is the zone's OWN stage, which is `stageNumber`
   * in the URL for the former but resolved per-zone for the latter.
   */
  private async computePromotionPreview(
    tournamentId: string,
    tournament: { readonly disciplineRef: { descriptorId: string; version: string } },
    sourceStageId: string,
    zone: { readonly zoneId: string; readonly number: number },
    saved: { readonly nextStageId: string; readonly plan: Record<string, unknown> },
  ): Promise<PromotionPreviewResponse> {
    const competition = new CompetitionRepository(this.db);
    const plan = promotionPlanFromStored(zone.zoneId, saved.nextStageId, saved.plan);
    const groups = await competition.listGroupsOfZone(zone.zoneId);
    const records = await Promise.all(
      groups.map(async (group) => ({
        group,
        record: await new StageReadModel(this.db).stageRecord(sourceStageId, group.groupId),
      })),
    );
    const descriptor = await new TournamentRepository(this.db).findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    if (!descriptor)
      throw new NotFoundException('Tournament discipline is not installed', {
        errorCode: 'zone-group-not-found',
      });
    const groupRecords = records.flatMap(({ group, record }) =>
      record === undefined ? [] : [{ group, record }],
    );
    if (groupRecords.length !== records.length) {
      throw new NotFoundException(`No source group records for zone ${zone.number}`, {
        errorCode: 'zone-group-not-found',
      });
    }
    const seriesDeclaration = await readStageSeries(this.db, { tournamentId, stageId: sourceStageId });
    const groupAccountings = new Map(
      groupRecords.map((entry) => [
        entry.group.groupId,
        computeAccounting(descriptor, entry.record.entrantIds, entry.record.outcomes, undefined, {
          seriesDeclaration,
        }),
      ]),
    );
    const groupNumbers = new Map(
      groupRecords.map((entry) => [entry.group.groupId, entry.group.number]),
    );
    const pipeline = standingsPipeline(descriptor, groupRecords[0]?.record.overrides ?? {});
    await this.validatePromotionPlan(sourceStageId, plan, groupAccountings);
    const outcome = evaluateGroupPromotion(plan, groupAccountings, pipeline, groupNumbers);
    return {
      combined: [...outcome.combined],
      ...(outcome.bands === undefined
        ? {}
        : {
            bands: Object.fromEntries(
              Object.entries(outcome.bands).map(([zoneRef, entrants]) => [zoneRef, [...entrants]]),
            ),
          }),
      trace: outcome.trace as unknown as Record<string, unknown>[],
    };
  }

  private async zoneDraw(
    tournamentId: string,
    body: DrawZonesRequest,
  ): Promise<DrawPreviewResponse> {
    assertDrawInput(body.zoneCount, body.seed);
    const outcome = drawZones(
      await this.entrants(tournamentId),
      constraintsOf(body.constraints),
      body.zoneCount,
      body.seed,
    );
    return {
      assignment: assignmentResponse(outcome.assignment),
      seed: outcome.seed,
      steps: outcome.steps,
    };
  }

  private async groupDraw(
    tournamentId: string,
    zoneId: string,
    body: DrawGroupsRequest,
  ): Promise<DrawPreviewResponse> {
    assertDrawInput(body.groupCount, body.seed);
    const entrantIds = await new CompetitionRepository(this.db).listEntrantIdsOfZone(zoneId);
    const outcome = drawGroups(
      await this.entrants(tournamentId, entrantIds),
      constraintsOf(body.constraints),
      body.groupCount,
      body.seed,
    );
    return {
      assignment: assignmentResponse(outcome.assignment),
      seed: outcome.seed,
      steps: outcome.steps,
    };
  }

  private async entrants(tournamentId: string, entrantIds?: readonly string[]) {
    const enrollment = new EnrollmentRepository(this.db);
    const accepted = (await enrollment.listEntrants(tournamentId)).filter(
      (entrant) => entrant.status === 'accepted',
    );
    const attributes = await enrollment.listTournamentAttributes(tournamentId);
    const selected =
      entrantIds === undefined
        ? accepted
        : accepted.filter((entrant) => entrantIds.includes(entrant.entrantId));
    return selected.map((entrant) => ({
      entrantId: entrant.entrantId,
      attributes: attributes.get(entrant.entrantId) ?? [],
    }));
  }

  private async publicStage(
    organizationAlias: string,
    tournamentAlias: string,
    stageNumber: number,
  ) {
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament || tournament.status === 'draft') {
      throw new NotFoundException(`No tournament "${tournamentAlias}" in "${organizationAlias}"`, {
        errorCode: 'zone-group-not-found',
      });
    }
    return this.stageOf(tournament.tournamentId, stageNumber);
  }

  private async adminStage(
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
    const { stage } = await this.stageOf(tournament.tournamentId, stageNumber);
    return {
      tournamentId: tournament.tournamentId,
      tournament,
      stage,
      audit: {
        organizationId,
        actor: `user:${request.subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (request.subject?.scopes ?? []).join(' '),
      },
    };
  }

  private async stageOf(tournamentId: string, stageNumber: number) {
    const stage = (
      await new CompetitionRepository(this.db).listStagesOfTournament(tournamentId)
    ).find((candidate) => candidate.number === stageNumber);
    if (!stage)
      throw new NotFoundException(`No stage ${stageNumber}`, { errorCode: 'zone-group-not-found' });
    return { stage };
  }

  private async zone(stageId: string, zoneNumber: number) {
    const zone = (await new CompetitionRepository(this.db).listZonesOfStage(stageId)).find(
      (candidate) => candidate.number === zoneNumber,
    );
    if (!zone)
      throw new NotFoundException(`No zone ${zoneNumber}`, { errorCode: 'zone-group-not-found' });
    return zone;
  }

  private async validatePromotionPlan(
    sourceStageId: string,
    plan: PromotionPlan,
    accountings?: ReadonlyMap<string, readonly { readonly entrantId: string }[]>,
  ): Promise<void> {
    const competition = new CompetitionRepository(this.db);
    const sourceGroups = await competition.listGroupsOfZone(plan.zoneId);
    const destinationZones = await competition.listZonesOfStage(plan.nextStageId);
    const records = await Promise.all(
      sourceGroups.map(async (group) => ({
        group,
        record: await new StageReadModel(this.db).stageRecord(sourceStageId, group.groupId),
      })),
    );
    validatePromotionPlan(
      plan,
      records.map((entry) => ({
        groupId: entry.group.groupId,
        number: entry.group.number,
        entrantCount:
          accountings?.get(entry.group.groupId)?.length ?? entry.record?.entrantIds.length ?? 0,
      })),
      destinationZones.length === 0
        ? [IMPLICIT_ZONE_NAME]
        : destinationZones.map((zone) => zone.name),
    );
  }
}

function constraintsOf(constraints: readonly unknown[] | undefined): readonly DrawConstraint[] {
  return (constraints ?? []) as readonly DrawConstraint[];
}

function assertDrawInput(count: number, seed: number): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new BadRequestException('Draw count must be a positive integer', {
      errorCode: 'zone-group-bad-request',
    });
  }
  if (!Number.isInteger(seed))
    throw new BadRequestException('Draw seed must be an integer', {
      errorCode: 'zone-group-bad-request',
    });
}

function throwConflict(error: unknown): never {
  if (error instanceof InvariantViolationError)
    throw new ConflictException(error.message, { errorCode: 'zone-group-conflict' });
  throw error;
}

function throwPromotionPlanError(error: unknown): never {
  if (error instanceof QualificationError)
    throw new BadRequestException(error.message, { errorCode: 'zone-group-bad-request' });
  throwConflict(error);
}

function promotionPlanFromRequest(
  zoneId: string,
  nextStageId: string,
  body: SavePromotionPlanRequest,
): PromotionPlan {
  return promotionPlanFromUnknown(zoneId, nextStageId, {
    perGroupAdvance: body.perGroupAdvance,
    combination: body.combination,
    ...(body.bands === undefined ? {} : { bands: body.bands }),
  });
}

function promotionPlanFromStored(
  zoneId: string,
  nextStageId: string,
  stored: Record<string, unknown>,
): PromotionPlan {
  const value = typeof stored === 'string' ? parseStoredPlan(stored) : stored;
  return promotionPlanFromUnknown(zoneId, nextStageId, value);
}

function promotionPlanFromUnknown(
  zoneId: string,
  nextStageId: string,
  value: Record<string, unknown>,
): PromotionPlan {
  const advance = value.perGroupAdvance;
  const combination = value.combination;
  if (
    !(
      (typeof advance === 'number' && Number.isInteger(advance)) ||
      (isRecord(advance) && Object.values(advance).every((count) => typeof count === 'number'))
    ) ||
    !isRecord(combination) ||
    typeof combination.mode !== 'string'
  ) {
    throw new BadRequestException('Promotion plan has an invalid shape', {
      errorCode: 'zone-group-bad-request',
    });
  }

  const parsedCombination =
    combination.mode === 'ranked' && isRecord(combination.pipeline)
      ? {
          mode: 'ranked' as const,
          pipeline: combination.pipeline as PromotionPlan['combination'] extends {
            readonly mode: 'ranked';
            readonly pipeline: infer Pipeline;
          }
            ? Pipeline
            : never,
        }
      : combination.mode === 'manual' && Array.isArray(combination.order)
        ? {
            mode: 'manual' as const,
            order: combination.order.filter(
              (entrantId): entrantId is string => typeof entrantId === 'string',
            ),
          }
        : combination.mode === 'group-order'
          ? { mode: 'group-order' as const }
          : undefined;
  if (!parsedCombination)
    throw new BadRequestException('Promotion plan has an invalid combination', {
      errorCode: 'zone-group-bad-request',
    });

  const bands = value.bands;
  if (
    bands !== undefined &&
    (!Array.isArray(bands) ||
      !bands.every(
        (band) =>
          isRecord(band) && typeof band.zoneRef === 'string' && typeof band.count === 'number',
      ))
  ) {
    throw new BadRequestException('Promotion plan has invalid destination bands', {
      errorCode: 'zone-group-bad-request',
    });
  }

  return {
    zoneId,
    nextStageId,
    perGroupAdvance: advance as PromotionPlan['perGroupAdvance'],
    combination: parsedCombination as PromotionPlan['combination'],
    ...(bands === undefined
      ? {}
      : {
          bands: bands as readonly { readonly zoneRef: string; readonly count: number }[],
        }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStoredPlan(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Converted to the same client-safe invalid-plan response below.
  }
  throw new BadRequestException('Stored promotion plan has an invalid shape', {
    errorCode: 'zone-group-bad-request',
  });
}

function assignmentResponse(assignment: { readonly groups?: Readonly<Record<string, number>> }): {
  readonly groups: Record<string, number>;
} {
  if (!assignment.groups)
    throw new BadRequestException('Expected a group assignment from the draw engine', {
      errorCode: 'zone-group-bad-request',
    });
  return { groups: { ...assignment.groups } };
}
