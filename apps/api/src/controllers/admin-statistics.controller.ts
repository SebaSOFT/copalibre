import { Body, Controller, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { NotFoundException } from '../http/error-contract.js';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { previewStatisticsRebuild, runStatisticsRebuild } from '@copalibre/statistics-refold';
import type { Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { StatisticsRebuildRequest, StatisticsRebuildResponse } from '../dto/admin.dto.js';
import { ProblemResponse } from '../dto/organization.dto.js';
import { DATABASE } from '../database.token.js';
import type { RequestWithSubject } from '../auth/request-context.js';

/**
 * The authenticated HTTP path for `copalibre statistics-rebuild` —
 * wraps `runStatisticsRebuild` unchanged (moved to `@copalibre/statistics-refold`
 * so both this controller and the CLI's direct-database fallback call the
 * exact same function), so a self-hosted operator can rebuild statistics
 * from a machine with no direct database access at all.
 */
@ApiTags('admin')
@Controller('organizations/:organizationAlias/statistics')
export class AdminStatisticsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Post('rebuild')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.rebuild-statistics')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Recompute every folded statistic total from source facts',
    description:
      'Organization-wide by default, or narrowed to one tournament. Idempotent — the same ' +
      'delete-then-insert write path the event-driven trigger already uses.',
  })
  @ApiOkResponse({ type: StatisticsRebuildResponse })
  @ApiUnauthorizedResponse({ type: ProblemResponse })
  @ApiForbiddenResponse({ type: ProblemResponse })
  async rebuild(
    @Param('organizationAlias') organizationAlias: string,
    @Body() body: StatisticsRebuildRequest,
    @Req() request: RequestWithSubject,
  ): Promise<StatisticsRebuildResponse> {
    try {
      const options = {
        organization: organizationAlias,
        ...(body.tournamentAlias === undefined ? {} : { tournament: body.tournamentAlias }),
      };
      if (body.dryRun === true) {
        return {
          ...(await previewStatisticsRebuild(this.db, options)),
          dryRun: true,
        };
      }
      const subject = request.subject;
      return {
        ...(await runStatisticsRebuild(this.db, {
          ...options,
          audit: {
            actor: `user:${subject?.subjectId ?? 'unknown'}`,
            authorizationContext: (subject?.scopes ?? []).join(' '),
          },
        })),
        dryRun: false,
      };
    } catch (error) {
      // runStatisticsRebuild throws a plain Error for "no such
      // organization/tournament" — the same shape createAdmin's HTTP
      // precedent (installation-bootstrap.controller.ts) already maps.
      throw new NotFoundException(error instanceof Error ? error.message : String(error), {
        errorCode: 'admin-statistics-not-found',
      });
    }
  }
}
