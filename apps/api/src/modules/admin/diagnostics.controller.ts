import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireSuperAdmin, SUPER_ADMIN_SCOPE } from '../../auth/access-requirement.js';
import { RequireScopes } from '../../auth/required-scopes.js';
import { SecurityPlaneTag } from '../../auth/security-plane.js';
import type { RequestWithSubject } from '../../auth/request-context.js';
import {
  DiagnosticsSummary,
  RetryOutboxRequest,
  RetryOutboxResponse,
} from '../../dto/diagnostics.dto.js';
import { DiagnosticsService } from './diagnostics.service.js';
import { OutboxInspectorService } from './outbox-inspector.service.js';

@ApiTags('platform-diagnostics')
@Controller('admin/diagnostics')
export class DiagnosticsController {
  constructor(
    @Inject(DiagnosticsService) private readonly diagnostics: DiagnosticsService,
    @Inject(OutboxInspectorService) private readonly outbox: OutboxInspectorService,
  ) {}

  @Get('summary')
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inspect installation health and aggregate telemetry' })
  @ApiOkResponse({ type: DiagnosticsSummary })
  summary(): Promise<DiagnosticsSummary> {
    return this.diagnostics.summary();
  }

  @Post('outbox/retry')
  @HttpCode(200)
  @SecurityPlaneTag('admin-control')
  @RequireSuperAdmin()
  @RequireScopes(SUPER_ADMIN_SCOPE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Manually re-enqueue selected dead letters with an atomic audit record',
  })
  @ApiOkResponse({ type: RetryOutboxResponse })
  async retry(
    @Body() body: RetryOutboxRequest,
    @Req() request: RequestWithSubject,
  ): Promise<RetryOutboxResponse> {
    const actor = actorOf(request);
    const authContext = authorizationContextOf(request);
    const result = await this.outbox.retry(body.eventIds, actor, authContext);
    this.diagnostics.invalidate();
    return result;
  }
}

function actorOf(request: RequestWithSubject): string {
  const subject = request.subject;
  const id = subject?.principalId ?? subject?.subjectId ?? 'unknown';
  return `user:${id}`;
}

function authorizationContextOf(request: RequestWithSubject): string {
  return (request.subject?.scopes ?? []).join(' ');
}
