import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from './auth/organization-access.guard.js';
import { AdminModule } from './modules/admin.module.js';
import { CoreModule } from './modules/core.module.js';
import { AuthModule } from './modules/auth.module.js';
import { OrganizationModule } from './modules/organization.module.js';
import { TournamentModule } from './modules/tournament.module.js';
import { RegistrationModule } from './modules/registration.module.js';
import { SchedulingModule } from './modules/scheduling.module.js';
import { ReportingModule } from './modules/reporting.module.js';
import { PublicModule } from './modules/public.module.js';

/**
 * A table of contents, not an implementation (0079). Each feature module owns
 * its own controllers; the two `APP_GUARD` providers stay here — Nest requires
 * a guard provided this way to be registered exactly once, and the root
 * module is the one place their global, cross-cutting nature is unambiguous.
 */
@Module({
  imports: [
    CoreModule,
    AuthModule,
    OrganizationModule,
    TournamentModule,
    RegistrationModule,
    SchedulingModule,
    ReportingModule,
    PublicModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: OrganizationAccessGuard },
  ],
})
export class AppModule {}
