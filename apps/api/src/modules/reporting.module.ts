import { Module } from '@nestjs/common';
import {
  ParticipantReportsController,
  ReportReviewController,
} from '../controllers/reports.controller.js';
import { DataImportExportController } from '../controllers/data-import-export.controller.js';
import { DataExportController } from '../controllers/data-export.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [
    ParticipantReportsController,
    ReportReviewController,
    DataImportExportController,
    DataExportController,
  ],
})
export class ReportingModule {}
