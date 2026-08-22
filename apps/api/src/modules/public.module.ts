import { Module } from '@nestjs/common';
import {
  PublicProjectionsController,
  PublicTournamentListingController,
} from '../controllers/public-projections.controller.js';
import { DisplayTokenController } from '../controllers/broadcast.controller.js';
import { PublicObjectsController } from '../controllers/public-objects.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [
    PublicTournamentListingController,
    PublicProjectionsController,
    PublicObjectsController,
    DisplayTokenController,
  ],
})
export class PublicModule {}
