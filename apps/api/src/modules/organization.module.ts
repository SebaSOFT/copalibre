import { Module } from '@nestjs/common';
import { OrganizationsController } from '../controllers/organizations.controller.js';
import { OrganizationMediaController } from '../controllers/identity-media.controller.js';
import { ClubsController } from '../controllers/clubs.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [OrganizationsController, OrganizationMediaController, ClubsController],
})
export class OrganizationModule {}
