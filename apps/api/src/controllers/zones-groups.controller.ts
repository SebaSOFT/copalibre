import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { DrawConstraint } from '@copalibre/domain';
import { drawGroups, drawZones } from '@copalibre/tournament-engine';
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
  ZoneResponse,
} from '../dto/zones-groups.dto.js';
import { resolveTournament } from './standings.controller.js';

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
    await this.zone(context.stage.stageId, zoneNumber);
    return this.groupDraw(context.tournamentId, body);
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
    const outcome = await this.groupDraw(context.tournamentId, body);
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
    body: DrawGroupsRequest,
  ): Promise<DrawPreviewResponse> {
    assertDrawInput(body.groupCount, body.seed);
    const outcome = drawGroups(
      await this.entrants(tournamentId),
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

  private async entrants(tournamentId: string) {
    const enrollment = new EnrollmentRepository(this.db);
    const accepted = (await enrollment.listEntrants(tournamentId)).filter(
      (entrant) => entrant.status === 'accepted',
    );
    const attributes = await enrollment.listTournamentAttributes(tournamentId);
    return accepted.map((entrant) => ({
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
      throw new NotFoundException(`No tournament "${tournamentAlias}" in "${organizationAlias}"`);
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
    if (!stage) throw new NotFoundException(`No stage ${stageNumber}`);
    return { stage };
  }

  private async zone(stageId: string, zoneNumber: number) {
    const zone = (await new CompetitionRepository(this.db).listZonesOfStage(stageId)).find(
      (candidate) => candidate.number === zoneNumber,
    );
    if (!zone) throw new NotFoundException(`No zone ${zoneNumber}`);
    return zone;
  }
}

function constraintsOf(constraints: readonly unknown[] | undefined): readonly DrawConstraint[] {
  return (constraints ?? []) as readonly DrawConstraint[];
}

function assertDrawInput(count: number, seed: number): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new BadRequestException('Draw count must be a positive integer');
  }
  if (!Number.isInteger(seed)) throw new BadRequestException('Draw seed must be an integer');
}

function throwConflict(error: unknown): never {
  if (error instanceof InvariantViolationError) throw new ConflictException(error.message);
  throw error;
}

function assignmentResponse(assignment: { readonly groups?: Readonly<Record<string, number>> }): {
  readonly groups: Record<string, number>;
} {
  if (!assignment.groups)
    throw new BadRequestException('Expected a group assignment from the draw engine');
  return { groups: { ...assignment.groups } };
}
