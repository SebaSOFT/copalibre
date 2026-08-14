import { Module } from '@nestjs/common';
import { PublicProjectionsController } from '../controllers/public-projections.controller.js';
import { DisplayTokenController } from '../controllers/broadcast.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [PublicProjectionsController, DisplayTokenController],
})
export class PublicModule {}
