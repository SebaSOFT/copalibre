import { Module } from '@nestjs/common';
import { TournamentsController } from '../controllers/tournaments.controller.js';
import { StagesController } from '../controllers/stages.controller.js';
import { SeedingController } from '../controllers/seeding.controller.js';
import { StandingsController } from '../controllers/standings.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [TournamentsController, StagesController, SeedingController, StandingsController],
})
export class TournamentModule {}
