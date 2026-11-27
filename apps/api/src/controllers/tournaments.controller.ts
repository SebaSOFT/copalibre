import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import {
  Controller,
  Logger,
  Inject,
  Get,
  Param,
  Req,
  Query,
  Post,
  Body,
  HttpCode,
  Put,
} from '@nestjs/common';
import { DATABASE } from '../database.token.js';
import type { Kysely } from 'kysely';
import type { Database } from '@copalibre/persistence';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import {
  HookScriptVocabularyResponse,
  ProblemResponse,
  TournamentResponse,
  EntrantAttributeKeysResponse,
  CreateTournamentRequest,
  TournamentSettingsResponse,
  SeriesMutationPreviewResponse,
  TournamentSettingsRequest,
  RulesetOverridesResponse,
  RulesetOverridesRequest,
  TournamentCustomScriptsResponse,
} from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import {
  customScriptVocabulary,
  customScripts,
  updateCustomScripts,
} from '../tournaments/custom-scripts.js';
import {
  findByScopedAlias,
  completion,
  exportConfiguration,
  matchesView,
  entrantAttributeKeys,
} from '../tournaments/reads.js';
import { TournamentCompletionResponse } from '../dto/tournament-completion.dto.js';
import { TournamentConfigurationExportResponse } from '../dto/tournament-configuration-export.dto.js';
import type { TournamentConfigurationExportDocument } from '../tournament-configuration-export.js';
import { ControlMatchesViewResponse } from '../dto/matches-view.dto.js';
import { create } from '../tournaments/create-tournament.js';
import { settings, previewSettingsMutation, updateSettings } from '../tournaments/settings.js';
import {
  rulesetOverrides,
  previewRulesetOverrides,
  updateRulesetOverrides,
} from '../tournaments/ruleset-overrides.js';
import { publish, archive, listActive } from '../tournaments/lifecycle.js';

/**
 * Organization-scoped tournament routes. The path shape mirrors the URL contract
 * (`/{organization}/tournaments/{tournament}`) so the public web, control web,
 * and TV surfaces can derive each other's URLs by prefix substitution — the API
 * resolves the alias tuple, never a database identifier from the caller.
 */
@ApiTags('tournaments')
@Controller('organizations/:organizationAlias/tournaments')
export class TournamentsController {
  private readonly logger = new Logger(TournamentsController.name);

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get('custom-script-vocabulary')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.create-tournaments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read supported tournament hook-script vocabulary' })
  @ApiOkResponse({ type: HookScriptVocabularyResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async customScriptVocabulary(
    @Param('organizationAlias') organizationAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<HookScriptVocabularyResponse> {
    return customScriptVocabulary(this.db, organizationAlias, request);
  }

  @Get(':tournamentAlias')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'Read a tournament by its organization-scoped alias',
    description:
      'A tournament alias is unique only within its organization, so both aliases are required.',
  })
  @ApiOkResponse({ type: TournamentResponse })
  async findByScopedAlias(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<TournamentResponse> {
    return findByScopedAlias(this.db, organizationAlias, tournamentAlias);
  }

  @Get(':tournamentAlias/completion')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'Tournament completion overview with per-stage and tournament-wide rollups',
    description:
      'Available publicly for published tournaments, and with organization-scoped authorization for unpublished tournaments.',
  })
  @ApiOkResponse({ type: TournamentCompletionResponse })
  async completion(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentCompletionResponse> {
    return completion(this.db, organizationAlias, tournamentAlias, request);
  }

  @Get(':tournamentAlias/export')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export the current tournament configuration as JSON' })
  @ApiOkResponse({ type: TournamentConfigurationExportResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async exportConfiguration(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentConfigurationExportDocument> {
    return exportConfiguration(this.db, organizationAlias, tournamentAlias, request);
  }

  /**
   * The organizer-facing matches view: the same flat, filterable card list
   * the public site shows, plus the full internal comparator trace on a
   * finalized, tiebreak-decided match. Gated by the same capability the
   * internal standings screen already requires — reaching this route at all
   * already proves the viewer may see that trace, so no card is narrowed
   * further.
   */
  @Get(':tournamentAlias/internal-matches-view')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.view-internal-standings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "A tournament's matches, with the full comparator trace where relevant",
  })
  @ApiOkResponse({ type: ControlMatchesViewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async matchesView(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Query('stageNumber') stageNumberValue: string | undefined,
    @Query('groupId') groupId: string | undefined,
    @Query('state') state: 'all' | 'live' | 'upcoming' | 'final' | undefined,
    @Req() request: RequestWithSubject,
  ): Promise<ControlMatchesViewResponse> {
    return matchesView(
      this.db,
      organizationAlias,
      tournamentAlias,
      stageNumberValue,
      groupId,
      state,
      request,
    );
  }

  /**
   * Backs weighted allocation's attribute picker (`stage-qualification`'s "An operator can
   * discover a tournament's known entrant-attribute keys"). Reads distinct keys off this
   * tournament's own recorded entrant attributes, never a discipline-level catalogue.
   */
  @Get(':tournamentAlias/entrant-attribute-keys')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-seeding')
  @ApiBearerAuth()
  @ApiOperation({ summary: "A tournament's distinct recorded entrant-attribute keys" })
  @ApiOkResponse({ type: EntrantAttributeKeysResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async entrantAttributeKeys(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<EntrantAttributeKeysResponse> {
    return entrantAttributeKeys(this.db, organizationAlias, tournamentAlias, request);
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.create-tournaments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a tournament in draft status',
    description:
      'Requires the copalibre.control scope and a token scoped to the target organization.',
  })
  @ApiCreatedResponse({ type: TournamentResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async create(
    @Param('organizationAlias') organizationAlias: string,
    @Body() body: CreateTournamentRequest,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentResponse> {
    return create(this.db, organizationAlias, body, request);
  }

  @Get(':tournamentAlias/settings')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read a tournament's editable settings" })
  @ApiOkResponse({ type: TournamentSettingsResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async settings(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentSettingsResponse> {
    return settings(this.db, organizationAlias, tournamentAlias, request);
  }

  @Post(':tournamentAlias/settings/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Classify a proposed tournament-settings edit before it is applied',
    description:
      'Reports, per field, whether the proposed name/region/capacity/checkInClosesAt values are ' +
      'safe, require a rebuild, or are blocked because a result already exists or the record is ' +
      'otherwise incoherent (e.g. a capacity below the current accepted-entrant count) — never ' +
      'applies anything itself.',
  })
  @ApiOkResponse({ type: SeriesMutationPreviewResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewSettingsMutation(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: TournamentSettingsRequest,
    @Req() request: RequestWithSubject,
  ): Promise<SeriesMutationPreviewResponse> {
    return previewSettingsMutation(this.db, organizationAlias, tournamentAlias, body, request);
  }

  @Put(':tournamentAlias/settings')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Edit a tournament's name, region, capacity or check-in close time",
    description:
      'Applies the same classification the preview endpoint reports; a `blocked_after_results` or ' +
      'otherwise incoherent field (e.g. a capacity below the current accepted-entrant count) refuses ' +
      'the whole edit rather than applying part of it.',
  })
  @ApiOkResponse({ type: TournamentSettingsResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async updateSettings(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: TournamentSettingsRequest,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentSettingsResponse> {
    return updateSettings(this.db, this.logger, organizationAlias, tournamentAlias, body, request);
  }

  @Get(':tournamentAlias/ruleset-overrides')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read a tournament's editable ruleset override fields" })
  @ApiOkResponse({ type: RulesetOverridesResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async rulesetOverrides(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<RulesetOverridesResponse> {
    return rulesetOverrides(this.db, organizationAlias, tournamentAlias, request);
  }

  @Post(':tournamentAlias/ruleset-overrides/preview')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Classify a proposed ruleset-override edit before it is applied',
    description:
      'Reports, per touched field, whether the proposed value is safe, requires a rebuild, or is ' +
      'blocked because a result already exists or the field names no declared policy — never applies ' +
      'anything itself.',
  })
  @ApiOkResponse({ type: SeriesMutationPreviewResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async previewRulesetOverrides(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: RulesetOverridesRequest,
    @Req() request: RequestWithSubject,
  ): Promise<SeriesMutationPreviewResponse> {
    return previewRulesetOverrides(this.db, organizationAlias, tournamentAlias, body, request);
  }

  @Put(':tournamentAlias/ruleset-overrides')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a tournament ruleset’s override fields',
    description:
      'Applies the same classification the preview endpoint reports; a `blocked_after_results` field ' +
      'or one naming no declared policy refuses the whole edit rather than applying part of it. ' +
      '`customScripts` and `registration.capacity` are refused here — edit them through their own ' +
      'dedicated routes.',
  })
  @ApiOkResponse({ type: RulesetOverridesResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiConflictResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  @ApiNotFoundResponse({ type: ProblemResponse })
  async updateRulesetOverrides(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: RulesetOverridesRequest,
    @Req() request: RequestWithSubject,
  ): Promise<RulesetOverridesResponse> {
    return updateRulesetOverrides(
      this.db,
      this.logger,
      organizationAlias,
      tournamentAlias,
      body,
      request,
    );
  }

  @Get(':tournamentAlias/custom-scripts')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Read tournament's organizer-authored hook scripts" })
  @ApiOkResponse({ type: TournamentCustomScriptsResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async customScripts(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentCustomScriptsResponse> {
    return customScripts(this.db, organizationAlias, tournamentAlias, request);
  }

  @Put(':tournamentAlias/custom-scripts')
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Replace tournament's organizer-authored hook scripts" })
  @ApiOkResponse({ type: TournamentCustomScriptsResponse })
  @ApiBadRequestResponse({ type: ProblemResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async updateCustomScripts(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Body() body: TournamentCustomScriptsResponse,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentCustomScriptsResponse> {
    return updateCustomScripts(this.db, organizationAlias, tournamentAlias, body, request);
  }

  @Post(':tournamentAlias/publish')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Publish a tournament',
    description:
      'Transitions draft to published. Audited with previous and resulting state; publishing is not destructive, so no confirmation flag is required.',
  })
  @ApiOkResponse({ type: TournamentResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async publish(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentResponse> {
    return publish(this.db, organizationAlias, tournamentAlias, request);
  }

  @Post(':tournamentAlias/archive')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.manage-tournament-lifecycle')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Archive a finished tournament',
    description:
      'Transitions finished to archived, legal only from finished. Changes default visibility ' +
      "only — no result, standing, registration, or audit data is affected, and the tournament's " +
      'own canonical URL keeps resolving.',
  })
  @ApiOkResponse({ type: TournamentResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async archive(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<TournamentResponse> {
    return archive(this.db, organizationAlias, tournamentAlias, request);
  }

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.create-tournaments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "List the organization's active (non-archived) tournaments",
    description: 'Excludes archived tournaments — their own detail route still resolves directly.',
  })
  @ApiOkResponse({ type: TournamentResponse, isArray: true })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async listActive(
    @Param('organizationAlias') organizationAlias: string,
    @Req() request: RequestWithSubject,
  ): Promise<readonly TournamentResponse[]> {
    return listActive(this.db, organizationAlias, request);
  }
}
