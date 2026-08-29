import { rm } from 'node:fs/promises';
import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../http/error-contract.js';
import type { DisciplineDescriptorDocument, TournamentProfileDocument } from '@copalibre/domain';
import {
  AUTHORED_MODULE_SOURCE,
  ModuleAliasConflictError,
  importValidatedModule,
  latestPerAlias,
  packageAuthoredModule,
  runningCopalibreVersion,
  submitModule,
  validateModulePackage,
  type ModuleKind,
  type ModuleValidationFailure,
  type ValidatedModule,
} from '@copalibre/module-distribution';
import {
  InstalledModuleRepository,
  TournamentProfileRepository,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { RequestWithSubject } from '../auth/request-context.js';
import { RequireSuperAdmin, SUPER_ADMIN_SCOPE } from '../auth/access-requirement.js';
import {
  RESOURCE_THROTTLE_LIMIT,
  RESOURCE_THROTTLE_TTL_MS,
} from '../auth/principal-throttler.guard.js';
import { RequireScopes } from '../auth/required-scopes.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { SharedThrottle } from '../auth/shared-throttle.decorator.js';
import { InstallModuleResponse } from '../dto/admin.dto.js';
import {
  AuthoredModuleRequest,
  AuthoredModuleSubmitRequest,
  AuthoredModuleSubmitResponse,
  AuthoredModuleValidationResponse,
} from '../dto/authored-module.dto.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';

/**
 * The first write surface for `discipline_descriptors`/`tournament_profiles`
 * (openspec 0164) — every other route reads them. Deliberately produces the
 * same module package `module add` does and installs it through
 * `importValidatedModule` unchanged (design.md's "produces a module package,
 * not a database row" decision): there is no second install mechanism to
 * keep in sync, so an authored module is an ordinary module in every respect
 * once it exists.
 */
@ApiTags('admin')
@Controller('admin/authored-modules')
export class AuthoredModulesController {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageAdapter,
  ) {}

  @Post('validate')
  @HttpCode(200)
  @Throttle({ default: { limit: RESOURCE_THROTTLE_LIMIT, ttl: RESOURCE_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Validate an authored document without installing it',
  })
  @ApiOkResponse({ type: AuthoredModuleValidationResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async validate(@Body() body: AuthoredModuleRequest): Promise<AuthoredModuleValidationResponse> {
    const { packaged, failures } = await this.packageAndValidate(body);
    await rm(packaged.workspaceRoot, { recursive: true, force: true });
    return { ok: failures.length === 0, failures };
  }

  @Post()
  @Throttle({ default: { limit: RESOURCE_THROTTLE_LIMIT, ttl: RESOURCE_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Package, validate and install an authored document, exactly as `module add` would',
  })
  @ApiCreatedResponse({ type: InstallModuleResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async install(
    @Body() body: AuthoredModuleRequest,
    @Req() request: RequestWithSubject,
  ): Promise<InstallModuleResponse> {
    const { packaged, failures, validated } = await this.packageAndValidate(body);
    try {
      if (!validated || failures.length > 0) {
        throw new BadRequestException(
          { message: 'Authored document failed validation', failures },
          { errorCode: 'authored-module-validation-failed' },
        );
      }

      await this.refuseIfAlteringReferencedVersion(
        body.kind,
        validated.artifact.alias,
        validated.artifact.version,
      );

      try {
        return await importValidatedModule(this.db, this.storage, packaged.directory, validated, {
          source: AUTHORED_MODULE_SOURCE,
          actor: `user:${request.subject?.subjectId ?? 'unknown'}`,
        });
      } catch (error) {
        if (error instanceof ModuleAliasConflictError) {
          throw new ConflictException(error.message, { errorCode: 'authored-module-conflict' });
        }
        throw error;
      }
    } finally {
      await rm(packaged.workspaceRoot, { recursive: true, force: true });
    }
  }

  @Post('submit')
  @Throttle({ default: { limit: RESOURCE_THROTTLE_LIMIT, ttl: RESOURCE_THROTTLE_TTL_MS } })
  @SharedThrottle()
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Contribute an already-installed authored module upstream, via `module submit`',
  })
  @ApiCreatedResponse({ type: AuthoredModuleSubmitResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async submit(@Body() body: AuthoredModuleSubmitRequest): Promise<AuthoredModuleSubmitResponse> {
    const document = await this.installedDocument(body.kind, body.alias, body.version);
    if (!document) {
      throw new NotFoundException(`No installed ${body.kind} "${body.alias}"@${body.version}`, {
        errorCode: 'authored-module-not-found',
      });
    }

    const packaged = await packageAuthoredModule({ kind: body.kind, document });
    try {
      return await submitModule({
        modulePath: packaged.directory,
        ...(body.upstreamRepository === undefined
          ? {}
          : { upstreamRepository: body.upstreamRepository }),
        ...(body.baseBranch === undefined ? {} : { baseBranch: body.baseBranch }),
      });
    } finally {
      await rm(packaged.workspaceRoot, { recursive: true, force: true });
    }
  }

  /**
   * Packages the authored document and runs it through the same
   * `validateModulePackage` every other module source uses — the path-
   * carrying failures it already produces (reserved-alias included) are
   * exactly what task 1.2/1.3 ask for, so nothing here re-implements them.
   * Adds one authored-specific check: a profile's stage formats against a
   * named installed discipline, which the schema itself cannot express
   * because a profile never names a discipline (design.md's decision).
   */
  private async packageAndValidate(body: AuthoredModuleRequest): Promise<{
    readonly packaged: Awaited<ReturnType<typeof packageAuthoredModule>>;
    readonly failures: readonly ModuleValidationFailure[];
    readonly validated?: ValidatedModule;
  }> {
    const document = body.document as unknown as
      DisciplineDescriptorDocument | TournamentProfileDocument;
    const packaged = await packageAuthoredModule({ kind: body.kind, document });
    const result = await validateModulePackage(packaged.directory, {
      runningCopalibreVersion: runningCopalibreVersion(process.env),
    });
    if (!result.ok) return { packaged, failures: result.failures };

    if (body.kind === 'tournament-profile' && body.disciplineAlias) {
      const formatFailures = await this.checkProfileFormats(
        result.value.artifact as TournamentProfileDocument,
        body.disciplineAlias,
      );
      if (formatFailures.length > 0) return { packaged, failures: formatFailures };
    }

    return { packaged, failures: [], validated: result.value };
  }

  private async checkProfileFormats(
    profile: TournamentProfileDocument,
    disciplineAlias: string,
  ): Promise<readonly ModuleValidationFailure[]> {
    const installed = await new InstalledModuleRepository(this.db).findByAlias(disciplineAlias);
    const latest = latestPerAlias(installed)[0];
    if (!latest) {
      return [
        {
          stage: 'profile-format',
          field: 'disciplineAlias',
          message: `No installed discipline named "${disciplineAlias}"`,
        },
      ];
    }
    const discipline = await new TournamentRepository(this.db).findDescriptor(
      latest.documentId,
      latest.version,
    );
    const availableFormats = discipline?.availableFormats ?? [];
    const failures: ModuleValidationFailure[] = [];
    profile.stages.forEach((stage, index) => {
      if (!availableFormats.includes(stage.format)) {
        failures.push({
          stage: 'profile-format',
          field: `stages[${index}].format`,
          message:
            `"${stage.format}" is not among "${disciplineAlias}"'s declared formats: ` +
            (availableFormats.join(', ') || '(none)'),
        });
      }
    });
    return failures;
  }

  /**
   * The existing retirement rule (`module remove`'s own check), applied
   * before install rather than after: altering a version a started
   * tournament references is refused, naming the holders, with revising into
   * a new version offered instead (design.md's "Revision follows the
   * existing retirement rule").
   */
  private async refuseIfAlteringReferencedVersion(
    kind: ModuleKind,
    alias: string,
    version: string,
  ): Promise<void> {
    const tournaments = new TournamentRepository(this.db);
    const holders =
      kind === 'discipline'
        ? await this.holdersOfDescriptorVersion(tournaments, alias, version)
        : await this.holdersOfProfileVersion(tournaments, alias, version);
    if (holders.length > 0) {
      throw new ConflictException(
        `Cannot alter "${alias}"@${version}: referenced by started tournament(s): ` +
          `${holders.join(', ')}. Revise into a new version instead.`,
        { errorCode: 'authored-module-version-referenced' },
      );
    }
  }

  private async holdersOfDescriptorVersion(
    tournaments: TournamentRepository,
    alias: string,
    version: string,
  ): Promise<readonly string[]> {
    const existing = await tournaments.findDescriptorByAlias(alias, version);
    if (!existing) return [];
    return tournaments.findStartedTournamentAliasesReferencingDescriptor(
      existing.descriptorId,
      version,
    );
  }

  private async holdersOfProfileVersion(
    tournaments: TournamentRepository,
    alias: string,
    version: string,
  ): Promise<readonly string[]> {
    const existing = await new TournamentProfileRepository(this.db).findByAlias(alias, version);
    if (!existing) return [];
    return tournaments.findStartedTournamentAliasesReferencingProfile(existing.profileId, version);
  }

  private async installedDocument(
    kind: ModuleKind,
    alias: string,
    version: string,
  ): Promise<DisciplineDescriptorDocument | TournamentProfileDocument | undefined> {
    if (kind === 'discipline') {
      const descriptor = await new TournamentRepository(this.db).findDescriptorByAlias(
        alias,
        version,
      );
      if (!descriptor) return undefined;
      const document: Record<string, unknown> = { ...descriptor };
      delete document.descriptorId;
      return document as unknown as DisciplineDescriptorDocument;
    }
    const profile = await new TournamentProfileRepository(this.db).findByAlias(alias, version);
    if (!profile) return undefined;
    const document: Record<string, unknown> = { ...profile };
    delete document.profileId;
    return document as unknown as TournamentProfileDocument;
  }
}
