import { Controller, Get } from '@nestjs/common';
import { ROLE, VERSION } from './role.js';

@Controller('health')
export class HealthController {
  @Get()
  health(): { role: string; version: string } {
    return { role: ROLE, version: VERSION };
  }
}
