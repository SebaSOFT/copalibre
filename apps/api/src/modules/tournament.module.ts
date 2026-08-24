import { Module } from '@nestjs/common';
import { TournamentsController } from '../controllers/tournaments.controller.js';
import { TournamentProfilesController } from '../controllers/tournament-profiles.controller.js';
import { StagesController } from '../controllers/stages.controller.js';
import { SeedingController } from '../controllers/seeding.controller.js';
import { StandingsController } from '../controllers/standings.controller.js';
import { TableProjectionsController } from '../controllers/table-projections.controller.js';
import { ZonesGroupsController } from '../controllers/zones-groups.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [
    TournamentsController,
    TournamentProfilesController,
    StagesController,
    SeedingController,
    StandingsController,
    TableProjectionsController,
    ZonesGroupsController,
  ],
})
export class TournamentModule {}
