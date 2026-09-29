import { Module } from '@nestjs/common';
import { AdminModulesController } from '../controllers/admin-modules.controller.js';
import { AdminStatisticsController } from '../controllers/admin-statistics.controller.js';
import { AuthoredModulesController } from '../controllers/authored-modules.controller.js';
import { CoreModule } from './core.module.js';
import { DiagnosticsController } from './admin/diagnostics.controller.js';
import { DiagnosticsService } from './admin/diagnostics.service.js';
import { OutboxInspectorService } from './admin/outbox-inspector.service.js';

/** The authenticated HTTP admin surface: statistics-rebuild and module management. */
@Module({
  imports: [CoreModule],
  controllers: [
    AdminStatisticsController,
    AdminModulesController,
    AuthoredModulesController,
    DiagnosticsController,
  ],
  providers: [DiagnosticsService, OutboxInspectorService],
})
export class AdminModule {}
