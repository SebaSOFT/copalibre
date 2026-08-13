import { resolveLabel, type TournamentProfile } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import type { AuditContext } from './enrollment-repository.js';

export interface StoredProfile {
  readonly profileId: string;
  readonly alias: string;
  readonly version: string;
  readonly name: string;
}

/**
 * Tournament profiles are published artifacts keyed by (id, semver), like
 * discipline descriptors: a new version is a new row, never an update, so a
 * tournament that pinned an earlier version keeps reading exactly what it
 * started on.
 */
export class TournamentProfileRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async save(
    uow: UnitOfWork,
    profile: TournamentProfile,
    context: AuditContext,
  ): Promise<StoredProfile> {
    const inserted = await uow.tx
      .insertInto('tournament_profiles')
      .values({
        profile_id: profile.profileId,
        alias: profile.alias,
        version: profile.version,
        name: resolveLabel(profile.name, 'en'),
        document: JSON.stringify(profile),
        created_at: new Date(),
      })
      .onConflict((oc) => oc.columns(['profile_id', 'version']).doNothing())
      .returning('profile_id')
      .executeTakeFirst();

    if (!inserted) {
      return {
        profileId: profile.profileId,
        alias: profile.alias,
        version: profile.version,
        name: resolveLabel(profile.name, 'en'),
      };
    }

    await uow.recordAudit({
      organizationId: context.organizationId,
      entityType: 'tournament-profile',
      entityId: profile.profileId,
      action: 'profile.published',
      actor: context.actor,
      authorizationContext: context.authorizationContext,
      resultingState: {
        profileId: profile.profileId,
        alias: profile.alias,
        version: profile.version,
        author: profile.attribution.author,
        licence: profile.attribution.licence,
      },
    });
    await uow.publishEvent({
      organizationId: context.organizationId,
      stream: `tournament-profile:${profile.profileId}`,
      entityId: profile.profileId,
      eventType: 'tournament-profile.published',
      projectionVersion: 1,
      payload: { profileId: profile.profileId, alias: profile.alias, version: profile.version },
    });

    return {
      profileId: profile.profileId,
      alias: profile.alias,
      version: profile.version,
      name: resolveLabel(profile.name, 'en'),
    };
  }

  async find(profileId: string, version: string): Promise<TournamentProfile | undefined> {
    const row = await this.db
      .selectFrom('tournament_profiles')
      .select('document')
      .where('profile_id', '=', profileId)
      .where('version', '=', version)
      .executeTakeFirst();
    return row ? (row.document as unknown as TournamentProfile) : undefined;
  }

  /** Looks up an installed profile by its catalogue identity. */
  async findByAlias(alias: string, version: string): Promise<TournamentProfile | undefined> {
    const row = await this.db
      .selectFrom('tournament_profiles')
      .select('document')
      .where('alias', '=', alias)
      .where('version', '=', version)
      .executeTakeFirst();
    return row ? (row.document as unknown as TournamentProfile) : undefined;
  }

  /** Every installed version under an alias, used to protect reserved names. */
  async findVersionsByAlias(alias: string): Promise<readonly TournamentProfile[]> {
    const rows = await this.db
      .selectFrom('tournament_profiles')
      .select('document')
      .where('alias', '=', alias)
      .orderBy('version')
      .execute();
    return rows.map((row) => row.document as unknown as TournamentProfile);
  }

  async listVersions(profileId: string): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('tournament_profiles')
      .select('version')
      .where('profile_id', '=', profileId)
      .execute();
    return rows.map((row) => row.version);
  }
}
