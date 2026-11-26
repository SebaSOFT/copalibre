import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import {
  Controller,
  Inject,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Body,
  Req,
  Patch,
  Put,
  Delete,
  HttpCode,
} from '@nestjs/common';
import { DATABASE } from '../database.token.js';
import type { Kysely } from 'kysely';
import type { Database } from '@copalibre/persistence';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import {
  ZoneResponse,
  CreateZoneRequest,
  RenameRequest,
  ZoneConfigurationRequest,
  GroupResponse,
  CreateGroupRequest,
  DrawPreviewResponse,
  DrawZonesRequest,
  ConfirmZoneDrawResponse,
  DrawGroupsRequest,
  ConfirmGroupDrawResponse,
  ManualZoneAssignmentResponse,
  ManualZoneAssignmentRequest,
  ManualGroupAssignmentResponse,
  ManualGroupAssignmentRequest,
  PromotionPlanResponse,
  SavePromotionPlanRequest,
  PromotionPreviewResponse,
  TargetingPromotionPreviewResponse,
} from '../dto/zones-groups.dto.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import {
  listZones,
  createZone,
  renameZone,
  configureZone,
  deleteZone,
  restoreZone,
  zoneEntrants,
} from '../zones-groups/zones.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import {
  listGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  restoreGroup,
} from '../zones-groups/groups.js';
import {
  previewZones,
  confirmZones,
  previewGroups,
  confirmGroups,
  assignZonesManually,
  assignGroupsManually,
} from '../zones-groups/draws.js';
import {
  savePromotionPlan,
  previewPromotion,
  promotionPlansTargetingStage,
} from '../zones-groups/promotion-plans.js';

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
    return listZones(this.db, organizationAlias, tournamentAlias, stageNumber);
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
    return createZone(this.db, organizationAlias, tournamentAlias, stageNumber, body, request);
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
    return renameZone(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      body,
      request,
    );
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
    return configureZone(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      body,
      request,
    );
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
    return deleteZone(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      request,
    );
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
    return restoreZone(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      request,
    );
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
    return zoneEntrants(this.db, organizationAlias, tournamentAlias, stageNumber, zoneNumber);
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
    return listGroups(this.db, organizationAlias, tournamentAlias, stageNumber, zoneNumber);
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
    return createGroup(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      body,
      request,
    );
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
    return renameGroup(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      groupNumber,
      body,
      request,
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
    return deleteGroup(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      groupNumber,
      request,
    );
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
    return restoreGroup(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      groupNumber,
      request,
    );
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
    return previewZones(this.db, organizationAlias, tournamentAlias, stageNumber, body, request);
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
    return confirmZones(this.db, organizationAlias, tournamentAlias, stageNumber, body, request);
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
    return previewGroups(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      body,
      request,
    );
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
    return confirmGroups(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      body,
      request,
    );
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
    return assignZonesManually(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      body,
      request,
    );
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
    return assignGroupsManually(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      body,
      request,
    );
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
    return savePromotionPlan(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      body,
      request,
    );
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
    return previewPromotion(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      zoneNumber,
      request,
    );
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
    return promotionPlansTargetingStage(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      request,
    );
  }
}
