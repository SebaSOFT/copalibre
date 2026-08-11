import { Module, type Provider } from '@nestjs/common';
import { createDatabase, databaseConfigFromEnv, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.token.js';
import { HealthController } from './health.controller.js';
import { LeaseController } from './lease.controller.js';
import { SchedulerService } from './scheduler.service.js';

const providers: Provider[] = [
  {
    provide: DATABASE,
    useFactory: (): Kysely<Database> => createDatabase(databaseConfigFromEnv()),
  },
  SchedulerService,
];

@Module({
  controllers: [HealthController, LeaseController],
  providers,
})
export class AppModule {}
