import type { Kysely } from 'kysely';
// kysely 0.29 moved the migration API to its own subpath; nodenext resolution
// can see it, which the previous commonjs/node setup could not.
import {
  Migrator,
  type Migration,
  type MigrationProvider,
  type MigrationResultSet,
} from 'kysely/migration';
import type { Database } from '../schema.js';
import { initialSchema } from './0001-initial-schema.js';
import { organizationAccess } from './0002-organization-access.js';
import { liveMatchConsole } from './0003-live-match-console.js';
import { rosterTerminology } from './0004-roster-terminology.js';
import { csvImportExport } from './0005-csv-import-export.js';
import { defaultModuleCatalogue } from './0006-default-module-catalogue.js';
import { broadcastDisplayTokens } from './0007-broadcast-display-tokens.js';
import { participantReports } from './0008-participant-reports.js';
import { tournamentArchivedAt } from './0009-tournament-archived-at.js';
import { communityModuleInstallation } from './0010-community-module-installation.js';
import { objectStorageMetadata } from './0011-object-storage-metadata.js';
import { organizationLocale } from './0012-organization-locale.js';
import { nativeIdentity } from './0013-native-identity.js';
import { matchEventNotes } from './0014-match-event-notes.js';
import { collectorThresholdConsumption } from './0015-collector-threshold-consumption.js';
import { resultReasonBackfill } from './0016-result-reason-backfill.js';
import { matchEventSegmentElapsedSeconds } from './0017-match-event-segment-elapsed-seconds.js';
import { matchRosterMembers } from './0018-match-roster-members.js';
import { personClubImagesAndNationality } from './0019-person-club-images-and-nationality.js';
import { zoneGroupAndPromotion } from './0020-zone-group-and-promotion.js';
import { promotionPlans } from './0021-promotion-plans.js';
import { zoneGroupEntrants } from './0022-zone-group-entrants.js';
import { entrantAbbreviations } from './0023-entrant-abbreviations.js';
import { personBirthDate } from './0024-person-birth-date.js';
import { organizationEmblem } from './0025-organization-emblem.js';
import { venueDetails } from './0026-venue-details.js';
import { objectMetadataOrganizationIndex } from './0027-object-metadata-organization-index.js';
import { tournamentRulesetCustomScripts } from './0028-tournament-ruleset-custom-scripts.js';
import { rbacUserAdministration } from './0029-rbac-user-administration.js';
import { sharedRateLimitCounters } from './0030-shared-rate-limit-counters.js';

/**
 * Migrations are explicit, ordered, and code-defined (no filesystem scanning),
 * so the applied set is reviewable in a pull request and identical in every
 * deployment artifact. Every migration ships a `down` — the architecture doc's
 * "migration ordering and rollback/forward-fix policy" requirement.
 */
export const MIGRATIONS: Readonly<Record<string, Migration>> = {
  '0001-initial-schema': initialSchema,
  '0002-organization-access': organizationAccess,
  '0003-live-match-console': liveMatchConsole,
  '0004-roster-terminology': rosterTerminology,
  '0005-csv-import-export': csvImportExport,
  '0006-default-module-catalogue': defaultModuleCatalogue,
  '0007-broadcast-display-tokens': broadcastDisplayTokens,
  '0008-participant-reports': participantReports,
  '0009-tournament-archived-at': tournamentArchivedAt,
  '0010-community-module-installation': communityModuleInstallation,
  '0011-object-storage-metadata': objectStorageMetadata,
  '0012-organization-locale': organizationLocale,
  '0013-native-identity': nativeIdentity,
  '0014-match-event-notes': matchEventNotes,
  '0015-collector-threshold-consumption': collectorThresholdConsumption,
  '0016-result-reason-backfill': resultReasonBackfill,
  '0017-match-event-segment-elapsed-seconds': matchEventSegmentElapsedSeconds,
  '0018-match-roster-members': matchRosterMembers,
  '0019-person-club-images-and-nationality': personClubImagesAndNationality,
  '0020-zone-group-and-promotion': zoneGroupAndPromotion,
  '0021-promotion-plans': promotionPlans,
  '0022-zone-group-entrants': zoneGroupEntrants,
  '0023-entrant-abbreviations': entrantAbbreviations,
  '0024-person-birth-date': personBirthDate,
  '0025-organization-emblem': organizationEmblem,
  '0026-venue-details': venueDetails,
  '0027-object-metadata-organization-index': objectMetadataOrganizationIndex,
  '0028-tournament-ruleset-custom-scripts': tournamentRulesetCustomScripts,
  '0029-rbac-user-administration': rbacUserAdministration,
  '0030-shared-rate-limit-counters': sharedRateLimitCounters,
};

/** The version `apps/api`'s readiness check expects to find applied. */
export const EXPECTED_SCHEMA_VERSION = Object.keys(MIGRATIONS).at(-1) as string;

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return { ...MIGRATIONS };
  }
}

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({ db, provider: new StaticMigrationProvider() });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<MigrationResultSet> {
  const result = await createMigrator(db).migrateToLatest();
  if (!result.error) {
    await recordSchemaVersion(db);
  }
  return result;
}

export async function migrateDownOneStep(db: Kysely<Database>): Promise<MigrationResultSet> {
  const result = await createMigrator(db).migrateDown();
  if (!result.error) {
    await recordSchemaVersion(db);
  }
  return result;
}

/**
 * Mirrors Kysely's internal migration table into `schema_version`, which is the
 * table `apps/api`'s readiness check queries — application code must not depend
 * on Kysely's internal bookkeeping table.
 */
async function recordSchemaVersion(db: Kysely<Database>): Promise<void> {
  const tableExists = await db.introspection
    .getTables()
    .then((tables) => tables.some((table) => table.name === 'schema_version'));
  if (!tableExists) return;

  const applied = await createMigrator(db)
    .getMigrations()
    .then((migrations) => migrations.filter((migration) => migration.executedAt !== undefined));

  await db.deleteFrom('schema_version').execute();
  if (applied.length > 0) {
    await db
      .insertInto('schema_version')
      .values(applied.map((migration) => ({ version: migration.name, applied_at: new Date() })))
      .execute();
  }
}

/** Latest applied migration name, or null on an unmigrated database. */
export async function readAppliedSchemaVersion(db: Kysely<Database>): Promise<string | null> {
  try {
    const row = await db
      .selectFrom('schema_version')
      .select('version')
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.version ?? null;
  } catch {
    // Table absent: the database has never been migrated.
    return null;
  }
}

/**
 * Readiness contract consumed by `apps/api` (task 4.3): refuse to serve
 * traffic unless the database is migrated to the version this release expects.
 */
export async function isSchemaReady(db: Kysely<Database>): Promise<boolean> {
  return (await readAppliedSchemaVersion(db)) === EXPECTED_SCHEMA_VERSION;
}
