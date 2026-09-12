import { Module } from '@nestjs/common';
import {
  NativeAuthController,
  PersonalAccessTokenController,
  WellKnownController,
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
    WellKnownController,
    PersonalAccessTokenController,
    OrganizationAccessController,
    InvitationAcceptanceController,
    InstallationRoleController,
  ],
})
export class AuthModule {}
