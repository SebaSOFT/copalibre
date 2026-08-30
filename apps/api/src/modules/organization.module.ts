import { Module } from '@nestjs/common';
import { OrganizationsController } from '../controllers/organizations.controller.js';
import { OrganizationMediaController } from '../controllers/identity-media.controller.js';
import { ClubsController } from '../controllers/clubs.controller.js';
import { ResourcesController } from '../controllers/resources.controller.js';
import { AuditTrailController } from '../controllers/audit-trail.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [
    OrganizationsController,
    OrganizationMediaController,
    ClubsController,
    ResourcesController,
    AuditTrailController,
  ],
})
export class OrganizationModule {}
