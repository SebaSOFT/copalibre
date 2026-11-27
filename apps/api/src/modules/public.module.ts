import { Module } from '@nestjs/common';
import { PublicProjectionsController } from '../controllers/public-projections.controller.js';
import { PublicTournamentListingController } from '../controllers/public-tournament-listing.controller.js';
import { PublicOrganizationClubController } from '../controllers/public-organization-club.controller.js';
import { DisplayTokenController } from '../controllers/broadcast.controller.js';
import { PublicObjectsController } from '../controllers/public-objects.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [
    PublicTournamentListingController,
    PublicOrganizationClubController,
    PublicProjectionsController,
    PublicObjectsController,
    DisplayTokenController,
  ],
})
export class PublicModule {}
