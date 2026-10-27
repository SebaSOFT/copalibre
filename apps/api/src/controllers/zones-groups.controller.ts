import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
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
import {
  effectiveFormat,
  isPlacementFormat,
  validateSeriesDeclaration,
  validateZoneFormat,
  type DrawConstraint,
  type Stage,
  type TournamentFormat,
  type Zone,
} from '@copalibre/domain';
import {
  drawGroups,
  drawZones,
  QualificationError,
  type PromotionPlan,
} from '@copalibre/tournament-engine';
import {
  CompetitionRepository,
  EnrollmentRepository,
  InvariantViolationError,
  TournamentRepository,
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
  ConfirmGroupDrawResponse,
  ConfirmZoneDrawResponse,
  CreateGroupRequest,
  CreateZoneRequest,
  ZoneConfigurationRequest,
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
  RenameRequest,
  SavePromotionPlanRequest,
  TargetingPromotionPreviewResponse,
  ZoneResponse,
} from '../dto/zones-groups.dto.js';
import { resolveTournament } from './standings.controller.js';
import { generatedAheadFrom } from './stage-qualifiers.js';
import {
  evaluateStoredPromotion,
  promotionPlanFromUnknown,
  validateStoredPromotionPlan,
} from './promotion-plans.js';
import { ownZoneSeriesOf, zoneSeriesOverrides } from './stage-series.js';

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
    return this.zoneResponses(
      stage,
      await new CompetitionRepository(this.db).listZonesOfStage(stage.stageId),
    );
  }

  @Post('zones')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
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
      const created = await withTransaction(this.db, (uow) =>
        competition.createZone(uow, {
          stageId: context.stage.stageId,
          number,
          name: body.name,
          ...context.audit,
        }),
      );
      return (await this.zoneResponses(context.stage, [created]))[0] as ZoneResponse;
    } catch (error) {
      throwConflict(error);
    }
  }

  @Patch('zones/:zoneNumber')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rename a zone — permitted at any time, seeded or not' })
  @ApiOkResponse({ type: ZoneResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async renameZone(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Body() body: RenameRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ZoneResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    const renamed = await withTransaction(this.db, (uow) =>
      new CompetitionRepository(this.db).renameZone(uow, {
        zoneId: zone.zoneId,
        name: body.name,
        ...context.audit,
      }),
    );
    return (await this.zoneResponses(context.stage, [renamed]))[0] as ZoneResponse;
  }

  @Put('zones/:zoneNumber/configuration')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Set or clear the format and series a zone declares itself',
    description:
      'A zone without its own format plays its stage’s. Refused once the stage holds a fixture, ' +
      'and for a format the tournament’s discipline does not offer.',
  })
  @ApiOkResponse({ type: ZoneResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async configureZone(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Body() body: ZoneConfigurationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<ZoneResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    const tournaments = new TournamentRepository(this.db);

    if (typeof body.format === 'string') {
      const descriptor = await tournaments.findDescriptor(
        context.tournament.disciplineRef.descriptorId,
        context.tournament.disciplineRef.version,
      );
      if (!descriptor)
        throw new NotFoundException('Tournament discipline is not installed', {
          errorCode: 'zone-group-not-found',
        });
      const valid = validateZoneFormat(
        zone,
        body.format as TournamentFormat,
        descriptor.availableFormats,
      );
      if (!valid.ok)
        throw new BadRequestException(valid.error.message, {
          errorCode: 'zone-group-bad-request',
        });
    }

    const nextFormat =
      body.format === undefined
        ? effectiveFormat(zone, context.stage)
        : ((body.format ?? context.stage.format) as TournamentFormat);
    if (body.series != null) {
      // A placement format produces an ordering, not two sides that could contest a series.
      if (isPlacementFormat(nextFormat))
        throw new BadRequestException(
          `Format "${nextFormat}" produces an ordering rather than two sides, so a zone playing it cannot declare a series`,
          { errorCode: 'zone-group-bad-request' },
        );
      const validated = validateSeriesDeclaration(body.series);
      if (!validated.ok)
        throw new BadRequestException(validated.error.message, {
          errorCode: 'zone-group-bad-request',
        });
    }

    const ruleset =
      body.series === undefined
        ? undefined
        : await tournaments.findLatestRuleset(context.tournamentId);
    if (body.series !== undefined && !ruleset)
      throw new BadRequestException(
        'This tournament has no configured ruleset to attach a zone series declaration to',
        { errorCode: 'zone-group-bad-request' },
      );

    try {
      const updated = await withTransaction(this.db, async (uow) => {
        const competition = new CompetitionRepository(this.db);
        await competition.assertStageHasNoFixtures(uow, context.stage.stageId);
        let current: Zone = zone;
        if (body.format !== undefined) {
          current = await competition.setZoneFormat(uow, {
            zoneId: zone.zoneId,
            format: (body.format as TournamentFormat | null) ?? null,
            ...context.audit,
          });
        }
        if (body.series !== undefined && ruleset) {
          const overrides = zoneSeriesOverrides(zone.zoneId, body.series);
          if (await tournaments.findLatestStageConfiguration(context.stage.stageId)) {
            await tournaments.updateStageConfiguration(uow, {
              stageId: context.stage.stageId,
              changedOverrides: overrides,
              ...context.audit,
            });
          } else {
            await tournaments.createStageConfiguration(uow, {
              stageId: context.stage.stageId,
              rulesetId: ruleset.rulesetId,
              overrides,
              ...context.audit,
            });
          }
        }
        return current;
      });
      return (await this.zoneResponses(context.stage, [updated]))[0] as ZoneResponse;
    } catch (error) {
      throwConflict(error);
    }
  }

  @Delete('zones/:zoneNumber')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a zone',
    description:
      'Available only before fixtures exist. The zone is hidden immediately, and its entrant ' +
      'assignments remain available if it is restored within 24 hours.',
  })
  @ApiOkResponse({ type: ZoneResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async deleteZone(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<ZoneResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    try {
      const deleted = await withTransaction(this.db, (uow) =>
        new CompetitionRepository(this.db).deleteZone(uow, {
          zoneId: zone.zoneId,
          ...context.audit,
        }),
      );
      return (await this.zoneResponses(context.stage, [deleted]))[0] as ZoneResponse;
    } catch (error) {
      throwConflict(error);
    }
  }

  @Post('zones/:zoneNumber/restore')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore a recently removed zone' })
  @ApiOkResponse({ type: ZoneResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async restoreZone(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<ZoneResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const repository = new CompetitionRepository(this.db);
    const zone = await repository.findZoneByNumberIncludingDeleted(
      context.stage.stageId,
      zoneNumber,
    );
    if (!zone) throw new NotFoundException(`Zone ${zoneNumber} was not found`);
    try {
      const restored = await withTransaction(this.db, (uow) =>
        repository.restoreZone(uow, { zoneId: zone.zoneId, ...context.audit }),
      );
      return (await this.zoneResponses(context.stage, [restored]))[0] as ZoneResponse;
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
    const competition = new CompetitionRepository(this.db);
    const groups = await competition.listGroupsOfZone(zone.zoneId);
    const entrantIdsByGroup = await competition.listGroupEntrantIdsOfZone(zone.zoneId);
    const entrantIds = groups.flatMap((group) => entrantIdsByGroup.get(group.groupId) ?? []);
    const labels = await new EnrollmentRepository(this.db).resolveEntrantNames(entrantIds);

    return groups.map((group) => {
      const groupEntrantIds = entrantIdsByGroup.get(group.groupId) ?? [];
      return {
        ...group,
        entrantIds: groupEntrantIds,
        entrants: groupEntrantIds.map((entrantId) => {
          const label = labels.get(entrantId);
          return {
            entrantId,
            ...(label === undefined ? {} : { displayName: label.name }),
            ...(label?.abbreviation === undefined ? {} : { abbreviation: label.abbreviation }),
          };
        }),
      };
    });
  }

  @Post('zones/:zoneNumber/groups')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
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

  @Patch('zones/:zoneNumber/groups/:groupNumber')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rename a group — permitted at any time, seeded or not' })
  @ApiOkResponse({ type: GroupResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async renameGroup(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Param('groupNumber', ParseIntPipe) groupNumber: number,
    @Body() body: RenameRequest,
    @Req() request: RequestWithSubject,
  ): Promise<GroupResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    const group = await this.group(zone.zoneId, groupNumber);
    return withTransaction(this.db, (uow) =>
      new CompetitionRepository(this.db).renameGroup(uow, {
        groupId: group.groupId,
        name: body.name,
        ...context.audit,
      }),
    );
  }

  @Delete('zones/:zoneNumber/groups/:groupNumber')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a group',
    description:
      'Available only before fixtures exist. The group is hidden immediately, and its entrant ' +
      'assignments remain available if it is restored within 24 hours.',
  })
  @ApiOkResponse({ type: GroupResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async deleteGroup(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Param('groupNumber', ParseIntPipe) groupNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<GroupResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    const group = await this.group(zone.zoneId, groupNumber);
    try {
      return await withTransaction(this.db, (uow) =>
        new CompetitionRepository(this.db).deleteGroup(uow, {
          groupId: group.groupId,
          ...context.audit,
        }),
      );
    } catch (error) {
      throwConflict(error);
    }
  }

  @Post('zones/:zoneNumber/groups/:groupNumber/restore')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore a recently removed group' })
  @ApiOkResponse({ type: GroupResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async restoreGroup(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Param('zoneNumber', ParseIntPipe) zoneNumber: number,
    @Param('groupNumber', ParseIntPipe) groupNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<GroupResponse> {
    const context = await this.adminStage(organizationAlias, tournamentAlias, stageNumber, request);
    const zone = await this.zone(context.stage.stageId, zoneNumber);
    const repository = new CompetitionRepository(this.db);
    const group = await repository.findGroupByNumberIncludingDeleted(zone.zoneId, groupNumber);
    if (!group) throw new NotFoundException(`Group ${groupNumber} was not found`);
    try {
      return await withTransaction(this.db, (uow) =>
        repository.restoreGroup(uow, { groupId: group.groupId, ...context.audit }),
      );
    } catch (error) {
      throwConflict(error);
    }
  }

  @Post('zones/draw/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
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
  @RequireOrganizationCapability('org.manage-zones-groups')
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
      return { ...outcome, zones: await this.zoneResponses(context.stage, persisted.entities) };
    } catch (error) {
      throwConflict(error);
    }
  }

  @Post('zones/:zoneNumber/groups/draw/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
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
  @RequireOrganizationCapability('org.manage-zones-groups')
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
  @RequireOrganizationCapability('org.manage-zones-groups')
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
        zones: await this.zoneResponses(context.stage, persisted.entities),
      };
    } catch (error) {
      throwConflict(error);
    }
  }

  @Post('zones/:zoneNumber/groups/assign')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
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
  @RequireOrganizationCapability('org.manage-zones-groups')
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
    const competition = new CompetitionRepository(this.db);
    const existing = await competition.findPromotionPlan(zone.zoneId);
    // Positions of a stage generated ahead are this plan's; re-routing them under played matches
    // would move entrants out of games already decided.
    const ahead =
      existing === undefined
        ? { generated: false, progressed: false }
        : await generatedAheadFrom(this.db, existing.nextStageId, existing.promotionPlanId);
    if (ahead.progressed) {
      throw new ConflictException(
        'This plan generated a stage that already has results; its positions cannot change',
        { errorCode: 'zone-group-conflict' },
      );
    }
    try {
      await this.validatePromotionPlan(context.stage.stageId, plan);
      const saved = await withTransaction(this.db, (uow) =>
        competition.createPromotionPlan(uow, {
          zoneId: zone.zoneId,
          nextStageId: nextStage.stage.stageId,
          plan: plan as unknown as Record<string, unknown>,
          ...context.audit,
        }),
      );
      return ahead.generated ? { ...saved, mutationClass: 'requires_rebuild' } : saved;
    } catch (error) {
      throwPromotionPlanError(error);
    }
  }

  @Get('zones/:zoneNumber/promotion-preview')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-zones-groups')
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
      // A distinct code from the shared `zone-group-not-found` this endpoint's
      // own stage/zone lookups above also throw — an operator
      // viewing a zone with no saved plan yet is an expected, benign state,
      // not the same condition as a deleted/renumbered stage or zone, so the
      // console needs to tell the two apart rather than treat every 404 here
      // as "nothing configured".
      throw new NotFoundException(`No promotion plan for zone ${zoneNumber}`, {
        errorCode: 'promotion-plan-not-found',
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
  @RequireOrganizationCapability('org.manage-zones-groups')
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
          // not an error for this reverse lookup as a whole.
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
   * `promotionPlansTargetingStage` (many zones discovered by reverse lookup).
   */
  private async computePromotionPreview(
    tournamentId: string,
    tournament: { readonly disciplineRef: { descriptorId: string; version: string } },
    sourceStageId: string,
    zone: { readonly zoneId: string; readonly number: number },
    saved: { readonly nextStageId: string; readonly plan: Record<string, unknown> },
  ): Promise<PromotionPreviewResponse> {
    const outcome = await evaluateStoredPromotion(this.db, {
      tournamentId,
      tournament,
      sourceStageId,
      zone,
      saved,
    });
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

  /** Zones with the format they play and the series they declare themselves, if any. */
  private async zoneResponses(
    stage: Pick<Stage, 'stageId' | 'format'>,
    zones: readonly Zone[],
  ): Promise<ZoneResponse[]> {
    const configuration = await new TournamentRepository(this.db).findLatestStageConfiguration(
      stage.stageId,
    );
    return zones.map((zone) => {
      const series = ownZoneSeriesOf(configuration?.overrides, zone.zoneId);
      return {
        ...zone,
        effectiveFormat: effectiveFormat(zone, stage),
        ...(series === undefined ? {} : { series }),
      };
    });
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

  private async group(zoneId: string, groupNumber: number) {
    const group = (await new CompetitionRepository(this.db).listGroupsOfZone(zoneId)).find(
      (candidate) => candidate.number === groupNumber,
    );
    if (!group)
      throw new NotFoundException(`No group ${groupNumber}`, { errorCode: 'zone-group-not-found' });
    return group;
  }

  private async validatePromotionPlan(sourceStageId: string, plan: PromotionPlan): Promise<void> {
    await validateStoredPromotionPlan(this.db, sourceStageId, plan);
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

function assignmentResponse(assignment: { readonly groups?: Readonly<Record<string, number>> }): {
  readonly groups: Record<string, number>;
} {
  if (!assignment.groups)
    throw new BadRequestException('Expected a group assignment from the draw engine', {
      errorCode: 'zone-group-bad-request',
    });
  return { groups: { ...assignment.groups } };
}
