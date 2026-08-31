import { Module } from '@nestjs/common';
import { SchedulesController } from '../controllers/schedules.controller.js';
import { MatchControlController } from '../controllers/match-control.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [SchedulesController, MatchControlController],
})
export class SchedulingModule {}
