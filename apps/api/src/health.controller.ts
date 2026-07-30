import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SecurityPlaneTag } from './auth/security-plane';
import { HealthResponse, ReadinessResponse } from './dto/health.dto';
import { checkReadiness } from './readiness';
import { ROLE, VERSION } from './role';

@ApiTags('operations')
@Controller()
export class HealthController {
  /** Liveness: the process is up. Says nothing about dependencies. */
  @Get('health')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Reports the process role and release version. Deliberately public and dependency-free so it stays answerable during a dependency outage.',
  })
  @ApiOkResponse({ type: HealthResponse })
  health(): HealthResponse {
    return { role: ROLE, version: VERSION };
  }

  /** Readiness: refuses traffic unless the database schema matches this release. */
  @Get('ready')
  @SecurityPlaneTag('public-read')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Fails with 503 when the database schema does not match the version this release expects, so an operator who skipped "copalibre migrate" gets a failing probe instead of a half-working API.',
  })
  @ApiOkResponse({ type: ReadinessResponse })
  @ApiServiceUnavailableResponse({ description: 'Schema version mismatch or unmigrated database' })
  async ready(): Promise<ReadinessResponse> {
    const report = await checkReadiness();
    if (!report.ready) {
      throw new ServiceUnavailableException(report.reason);
    }
    return { role: ROLE, version: VERSION, schemaVersion: report.expectedSchemaVersion };
  }
}
