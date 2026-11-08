import { Module } from '@nestjs/common';
import {
  NativeAuthController,
  PersonalAccessTokenController,
} from '../controllers/auth.controller.js';
import {
  InstallationRoleController,
  InvitationAcceptanceController,
  OrganizationAccessController,
} from '../controllers/organization-access.controller.js';
import { CoreModule } from './core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [
    NativeAuthController,
    PersonalAccessTokenController,
    OrganizationAccessController,
    InvitationAcceptanceController,
    InstallationRoleController,
  ],
})
export class AuthModule {}
