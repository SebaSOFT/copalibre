import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from './auth/organization-access.guard.js';
import { PrincipalThrottlerGuard } from './auth/principal-throttler.guard.js';
import { ApiExceptionFilter } from './http/error-contract.js';
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
 * Permissive safety-net default: the six endpoints with a real risk
 * profile carry their own strict `@Throttle()` overrides; this global limit
 * only exists so a future route that forgets an override is not unlimited.
 */
const DEFAULT_THROTTLE = { ttl: 60_000, limit: 1_000 };

/**
 * A table of contents, not an implementation. Each feature module owns
 * its own controllers; the `APP_GUARD` providers stay here — Nest requires
 * a guard provided this way to be registered exactly once, and the root
 * module is the one place their global, cross-cutting nature is unambiguous.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ...DEFAULT_THROTTLE }]),
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
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: OrganizationAccessGuard },
    // Registered after the guards above so `request.subject` is already
    // resolved when it keys the bucket (principal where authenticated,
    // client IP otherwise). Exactly one throttling guard, so no route is
    // ever evaluated against two different buckets for the same override.
    { provide: APP_GUARD, useClass: PrincipalThrottlerGuard },
  ],
})
export class AppModule {}
