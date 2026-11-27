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
  ApiQuery,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import {
  Controller,
  Logger,
  Inject,
  Get,
  Param,
  Req,
  Post,
  Body,
  Patch,
  ParseIntPipe,
  Delete,
  HttpCode,
  Query,
  Put,
} from '@nestjs/common';
import { DATABASE } from '../database.token.js';
import type { Kysely } from 'kysely';
import type { Database } from '@copalibre/persistence';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import {
  StageResponse,
  ProblemResponse,
  CreateStageRequest,
  UpdateStageRequest,
  StageDeletionResponse,
  DeleteStageRequest,
  SeriesMutationPreviewResponse,
  SeriesDeclarationRequest,
  StageConfigurationResponse,
  StageConfigurationRequest,
  NextRoundRequest,
} from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { list } from '../stages/stage-listing.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import { create } from '../stages/create-stage.js';
import { update } from '../stages/update-stage.js';
import { remove } from '../stages/remove-stage.js';
import { previewSeriesMutation } from '../stages/series-mutation-preview.js';
import {
  configuration,
  previewConfigurationMutation,
  updateConfiguration,
} from '../stages/stage-configuration.js';
import { StageFixturesResponse } from '../dto/schedule.dto.js';
import { fixtures } from '../stages/fixtures.js';
import { nextRound } from '../stages/next-round.js';

export { assertAllocationRequestComplete } from '../stages/create-stage.js';

/**
 * Stage creation.
 *
 * The step between "accepted registrations exist" and "a stage exists, ready to be seeded" — the
 * gap identified by a walkthrough: `CompetitionRepository.createStageInTournament` was real, tested,
 * and had no caller anywhere in `apps/api`. This endpoint only creates the stage; generating its
 * bracket is `POST .../stages/:stageNumber/seeding` (`seeding.controller.ts`), the same fixture-
 * generation path an operator already uses to reseed a later stage.
 */
@ApiTags('stages')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias/stages')
export class StagesController {
  private readonly logger = new Logger(StagesController.name);

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'List a tournament’s stages',
    description:
      'Number, name and format for every stage, plus whether each already holds a generated ' +
      'fixture — an organizer’s stage list carries no more sensitivity than its zone list.',
  })
  @ApiOkResponse({ type: StageResponse, isArray: true })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async list(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly StageResponse[]> {
    return list(this.db, organizationAlias, tournamentAlias, request);
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a stage from the tournament’s accepted registrations',
    description:
      'Number, name and format all default. Fixtures are not generated here — publish a seed order ' +
      'via POST .../stages/:stageNumber/seeding afterward.',
  })
  @ApiCreatedResponse({ type: StageResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async create(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: CreateStageRequest,
    @Req() request: RequestWithSubject,
  ): Promise<StageResponse> {
    return create(this.db, organizationAlias, tournamentAlias, body, request);
  }

  @Patch(':stageNumber')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rename a stage or change its format',
    description:
      'A rename applies regardless of whether the stage is seeded. A format change is refused once ' +
      'the stage already holds a generated fixture, naming that fixtures already exist.',
  })
  @ApiOkResponse({ type: StageResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async update(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: UpdateStageRequest,
    @Req() request: RequestWithSubject,
  ): Promise<StageResponse> {
    return update(this.db, organizationAlias, tournamentAlias, stageNumber, body, request);
  }

  @Delete(':stageNumber')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Preview or remove a stage and its fixtures',
    description:
      '`dryRun=true` reports the records that would be removed without changing data. Deletion ' +
      'requires `confirmationName` to exactly match the current stage name.',
  })
  @ApiQuery({ name: 'dryRun', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: StageDeletionResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async remove(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Query('dryRun') dryRun: string | undefined,
    @Body() body: DeleteStageRequest,
    @Req() request: RequestWithSubject,
  ): Promise<StageDeletionResponse> {
    return remove(this.db, organizationAlias, tournamentAlias, stageNumber, dryRun, body, request);
  }

  @Post(':stageNumber/series/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Classify a proposed series edit before it is applied',
    description:
      'Reports, per field, whether the proposed span/resolutionClass/neutralGround values are safe, ' +
      'require a rebuild (naming how many fixtures it would invalidate), or are blocked because the ' +
      'series already has a result — never applies anything itself.',
  })
  @ApiOkResponse({ type: SeriesMutationPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewSeriesMutation(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: SeriesDeclarationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<SeriesMutationPreviewResponse> {
    return previewSeriesMutation(
      this.db,
      this.logger,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      body,
      request,
    );
  }

  @Get(':stageNumber/configuration')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read a stage's editable configuration override fields" })
  @ApiOkResponse({ type: StageConfigurationResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async configuration(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<StageConfigurationResponse> {
    return configuration(this.db, organizationAlias, tournamentAlias, stageNumber, request);
  }

  @Post(':stageNumber/configuration/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Classify a proposed stage-configuration edit before it is applied',
    description:
      'Reports, per touched field, whether the proposed value is safe, requires a rebuild (naming ' +
      'how many fixtures it would invalidate), or is blocked — never applies anything itself.',
  })
  @ApiOkResponse({ type: SeriesMutationPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewConfigurationMutation(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: StageConfigurationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<SeriesMutationPreviewResponse> {
    return previewConfigurationMutation(
      this.db,
      this.logger,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      body,
      request,
    );
  }

  @Put(':stageNumber/configuration')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Edit a stage's configuration override fields",
    description:
      'Refused once the stage already holds a generated fixture, naming that fixtures already exist. ' +
      'A field with no declared policy, or one classified `blocked_after_results` on a stage that ' +
      'already has a recorded result, refuses the whole edit rather than applying part of it.',
  })
  @ApiOkResponse({ type: StageConfigurationResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async updateConfiguration(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: StageConfigurationRequest,
    @Req() request: RequestWithSubject,
  ): Promise<StageConfigurationResponse> {
    return updateConfiguration(
      this.db,
      this.logger,
      organizationAlias,
      tournamentAlias,
      stageNumber,
      body,
      request,
    );
  }

  @Get(':stageNumber/fixtures')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-stages')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'A stage’s generated fixtures, with real fixture ids',
    description:
      'What a schedule builder assigns a time and venue to — distinct from the bracket graph’s ' +
      'own node ids, which are never persisted.',
  })
  @ApiOkResponse({ type: StageFixturesResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async fixtures(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Req() request: RequestWithSubject,
  ): Promise<StageFixturesResponse> {
    return fixtures(this.db, organizationAlias, tournamentAlias, stageNumber, request);
  }

  @Post(':stageNumber/rounds/next')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.operate-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate the next round of one zone of a Swiss or single-elimination stage',
    description:
      'Scoped to one zone: validates that all matches in the zone’s current round are finalized, calculates standings from that zone’s results, ' +
      'and generates pairings among that zone’s entrants only. A stage with several zones requires `zoneNumber`.',
  })
  @ApiOkResponse({ type: StageFixturesResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async nextRound(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber', ParseIntPipe) stageNumber: number,
    @Body() body: NextRoundRequest,
    @Req() request: RequestWithSubject,
  ): Promise<StageFixturesResponse> {
    return nextRound(this.db, organizationAlias, tournamentAlias, stageNumber, body, request);
  }
}
