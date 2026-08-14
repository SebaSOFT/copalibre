import { Module } from '@nestjs/common';
import {
  NativeAuthController,
  PersonalAccessTokenController,
} from '../controllers/auth.controller.js';
import {
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
  ],
})
export class AuthModule {}
