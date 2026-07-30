import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { checkReadiness } from './readiness';
import { ROLE, VERSION } from './role';

@Controller()
export class HealthController {
  /** Liveness: the process is up. Says nothing about dependencies. */
  @Get('health')
  health(): { role: string; version: string } {
    return { role: ROLE, version: VERSION };
  }

  /** Readiness: refuses traffic unless the database schema matches this release. */
  @Get('ready')
  async ready(): Promise<{ role: string; version: string; schemaVersion: string }> {
    const report = await checkReadiness();
    if (!report.ready) {
      throw new ServiceUnavailableException(report.reason);
    }
    return { role: ROLE, version: VERSION, schemaVersion: report.expectedSchemaVersion };
  }
}
