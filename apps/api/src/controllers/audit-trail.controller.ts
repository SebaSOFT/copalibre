import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditReader,
  OrganizationRepository,
  isRefusal,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { RequireOrganizationCapability } from '../auth/access-requirement.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import { DATABASE } from '../database.token.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { NotFoundException } from '../http/error-contract.js';
import { AuditTrailResponse } from '../dto/audit.dto.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function pageOptions(limit: string | undefined, offset: string | undefined) {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  return {
    limit:
      Number.isInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_LIMIT)
        : DEFAULT_LIMIT,
    offset: Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0,
  };
}

/**
 * The audit trail's reader-facing surface (openspec 0166, tasks 4.2-4.3):
 * what happened to this organization, what a given actor did, and what was
 * attempted and refused — scoped to the reader's own authority, exactly as
 * the accepted requirement describes. Gated by its own capability
 * (`org.view-audit-trail`), like every other route; a refused attempt to
 * open it is recorded like any other refusal by the central exception
 * filter (`ApiExceptionFilter`), with no extra code needed here.
 */
@ApiTags('audit-trail')
@Controller('organizations/:organizationAlias/audit-trail')
export class AuditTrailController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('admin-control')
  @RequireOrganizationCapability('org.view-audit-trail')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Read the organization’s audit trail',
    description:
      'What happened, chronologically newest first: applied changes and refused attempts alike. ' +
      'Optionally narrowed to one actor via ?actor=. Paginated via ?limit=&offset=.',
  })
  @ApiOkResponse({ type: AuditTrailResponse })
  async trail(
    @Param('organizationAlias') organizationAlias: string,
    @Query('actor') actor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Req() request: RequestWithSubject,
  ): Promise<AuditTrailResponse> {
    const organizationId = await resolveAdminOrganization(this.db, organizationAlias, request);
    const options = pageOptions(limit, offset);
    const reader = new AuditReader(this.db);
    const page =
      actor === undefined
        ? await reader.forOrganization(organizationId, options)
        : await reader.forActor(organizationId, actor, options);

    return {
      records: page.records.map((record) => ({
        ...record,
        outcome: isRefusal(record) ? 'refused' : 'applied',
      })),
      total: page.total,
      limit: options.limit,
      offset: options.offset,
    };
  }
}

async function resolveAdminOrganization(
  db: Kysely<Database>,
  organizationAlias: string,
  request: RequestWithSubject,
): Promise<string> {
  const organization = await new OrganizationRepository(db).findByAlias(organizationAlias);
  if (!organization) {
    throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
      errorCode: 'audit-trail-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: organization.organizationId },
  });
  return organization.organizationId;
}
