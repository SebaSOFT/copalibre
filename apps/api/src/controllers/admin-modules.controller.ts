import { rm } from 'node:fs/promises';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import semver from 'semver';
import {
  ModuleAliasConflictError,
  ModuleFetchError,
  ModuleValidationError,
  UnsatisfiedModuleCapabilitiesError,
  documentFor,
  fetchModule,
  importValidatedModule,
  latestPerAlias,
  listPublishedVersions,
  resolveSource,
  runningCopalibreVersion,
  sourceFor,
  validateModulePackageOrThrow,
  verifyInstalledModule,
} from '@copalibre/module-distribution';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import {
  InstalledModuleRepository,
  SYSTEM_ORGANIZATION,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { RequireSuperAdmin, SUPER_ADMIN_SCOPE } from '../auth/access-requirement.js';
import { RequireScopes } from '../auth/required-scopes.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import {
  InstallModuleRequest,
  InstallModuleResponse,
  InstalledModuleResponse,
  ModuleVerifyResultResponse,
  OutdatedModuleResponse,
  RemoveModuleResponse,
} from '../dto/admin.dto.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';

/**
 * The authenticated HTTP path for `copalibre module add/list/remove/verify`
 * (0085) — installation-wide, never organization-scoped, matching
 * `module-commands.ts`'s own `SYSTEM_ORGANIZATION` audit scoping today.
 * Reuses the same domain logic the CLI's direct-database path calls
 * (`fetchModule`/`validateModulePackageOrThrow`/`importValidatedModule`/
 * `InstalledModuleRepository`) unchanged; only the presentation layer (JSON
 * here, stdout text in `module-commands.ts`) differs (design.md's Risk note).
 */
@ApiTags('admin')
@Controller('admin/modules')
export class AdminModulesController {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageAdapter,
  ) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List installed modules, or only the ones with a newer published version',
  })
  @ApiOkResponse({ type: InstalledModuleResponse, isArray: true })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async list(
    @Query('outdated') outdated: string | undefined,
  ): Promise<InstalledModuleResponse[] | OutdatedModuleResponse[]> {
    const modules = await new InstalledModuleRepository(this.db).list();
    if (outdated !== 'true') {
      return modules.map((module_) => ({
        moduleId: module_.moduleId,
        kind: module_.kind,
        alias: module_.alias,
        version: module_.version,
        sourceKind: module_.sourceKind,
        attributionAuthor: module_.attribution.author,
      }));
    }

    const latestInstalledByAlias = latestPerAlias(modules);
    const outdatedModules: OutdatedModuleResponse[] = [];
    for (const module_ of latestInstalledByAlias) {
      const source = sourceFor(module_);
      const versions = await listPublishedVersions(source, module_.alias);
      const latestPublished = [...versions].sort(semver.rcompare)[0];
      if (!latestPublished || !semver.gt(latestPublished, module_.version)) continue;
      outdatedModules.push({
        alias: module_.alias,
        currentVersion: module_.version,
        latestVersion: latestPublished,
        upgrade: semver.diff(module_.version, latestPublished) ?? 'unknown',
      });
    }
    return outdatedModules;
  }

  @Post()
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Install a module by alias, optionally pinned to a version range' })
  @ApiCreatedResponse({ type: InstallModuleResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async install(
    @Body() body: InstallModuleRequest,
    @Req() request: RequestWithSubject,
  ): Promise<InstallModuleResponse> {
    if (!body.alias?.trim()) throw new BadRequestException('alias is required');

    let source;
    try {
      source = resolveSource(body.source, process.env);
    } catch (error) {
      throw new BadRequestException(moduleErrorMessage(error));
    }

    let fetched;
    try {
      fetched = await fetchModule(source, body.alias, body.range);
    } catch (error) {
      throw new BadRequestException(moduleErrorMessage(error));
    }
    try {
      const validated = await validateModulePackageOrThrow(fetched.directory, {
        runningCopalibreVersion: runningCopalibreVersion(process.env),
      });
      const report = await importValidatedModule(
        this.db,
        this.storage,
        fetched.directory,
        validated,
        {
          source,
          actor: `user:${request.subject?.subjectId ?? 'unknown'}`,
          overrideUnsatisfiedCapabilities: body.allowUnsatisfiedCapabilities,
        },
      );
      return report;
    } catch (error) {
      if (error instanceof ModuleAliasConflictError) throw new ConflictException(error.message);
      throw new BadRequestException(moduleErrorMessage(error));
    } finally {
      await rm(fetched.checkoutRoot, { recursive: true, force: true });
    }
  }

  @Delete(':alias')
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove an installed module that no started tournament references' })
  @ApiOkResponse({ type: RemoveModuleResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async remove(
    @Param('alias') alias: string,
    @Req() request: RequestWithSubject,
  ): Promise<RemoveModuleResponse> {
    const modules = new InstalledModuleRepository(this.db);
    const tournaments = new TournamentRepository(this.db);
    const installed = await modules.findByAlias(alias);
    if (installed.length === 0) throw new NotFoundException(`No installed module named "${alias}"`);

    const referencing = new Set<string>();
    for (const module_ of installed) {
      const aliases =
        module_.kind === 'discipline'
          ? await tournaments.findStartedTournamentAliasesReferencingDescriptor(
              module_.documentId,
              module_.version,
            )
          : await tournaments.findStartedTournamentAliasesReferencingProfile(
              module_.documentId,
              module_.version,
            );
      for (const tournamentAlias of aliases) referencing.add(tournamentAlias);
    }
    if (referencing.size > 0) {
      throw new ConflictException(
        `Cannot remove "${alias}": referenced by started tournament(s): ${[...referencing].join(', ')}`,
      );
    }

    const actor = `user:${request.subject?.subjectId ?? 'unknown'}`;
    for (const module_ of installed) {
      const assets = await modules.findAssetsByModuleId(module_.moduleId);
      await Promise.all(assets.map((asset) => this.storage.delete({ key: asset.storageKey })));
      await withTransaction(this.db, (uow) =>
        modules.remove(uow, module_.moduleId, {
          module: module_,
          organizationId: SYSTEM_ORGANIZATION,
          actor,
          authorizationContext: 'system:module.remove',
        }),
      );
    }
    return { alias, removedCount: installed.length };
  }

  @Post('verify')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Re-validate every installed module against the running core version' })
  @ApiOkResponse({ type: ModuleVerifyResultResponse, isArray: true })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async verify(): Promise<ModuleVerifyResultResponse[]> {
    const modules = new InstalledModuleRepository(this.db);
    const installed = await modules.list();
    const results: ModuleVerifyResultResponse[] = [];
    for (const module_ of installed) {
      const document = await documentFor(this.db, module_);
      if (!document) {
        results.push({
          alias: module_.alias,
          version: module_.version,
          ok: false,
          failures: [{ stage: 'installed-document', message: 'installed document is missing' }],
        });
        continue;
      }
      const assets = await modules.findAssetsByModuleId(module_.moduleId);
      const failures = await verifyInstalledModule(
        this.storage,
        runningCopalibreVersion(process.env),
        module_,
        document,
        assets,
      );
      results.push({
        alias: module_.alias,
        version: module_.version,
        ok: failures.length === 0,
        failures: failures.map((failure) => ({ stage: failure.stage, message: failure.message })),
      });
    }
    return results;
  }
}

/**
 * HTTP-appropriate error text — unlike `module-commands.ts`'s
 * `describeModuleError`, never suggests a CLI retry flag (`--allow-
 * unsatisfied-capabilities`); a caller here already sent
 * `allowUnsatisfiedCapabilities` in the request body, not a flag.
 */
function moduleErrorMessage(error: unknown): string {
  if (error instanceof ModuleValidationError) {
    return `Validation failed: ${error.failures.map((failure) => `[${failure.stage}] ${failure.message}`).join('; ')}`;
  }
  if (error instanceof UnsatisfiedModuleCapabilitiesError) return error.message;
  if (error instanceof ModuleFetchError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
