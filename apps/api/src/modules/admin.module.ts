import { Module } from '@nestjs/common';
import { AdminModulesController } from '../controllers/admin-modules.controller.js';
import { AdminStatisticsController } from '../controllers/admin-statistics.controller.js';
import { CoreModule } from './core.module.js';

/** The authenticated HTTP admin surface (0085): statistics-rebuild and module management. */
@Module({
  imports: [CoreModule],
  controllers: [AdminStatisticsController, AdminModulesController],
})
export class AdminModule {}
