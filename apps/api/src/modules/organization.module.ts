import { Module } from '@nestjs/common';
import { OrganizationsController } from '../controllers/organizations.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [OrganizationsController],
})
export class OrganizationModule {}
