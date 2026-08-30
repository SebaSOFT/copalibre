import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * `organization_invites.rescinded_at` — nullable, additive, no backfill,
 * mirroring `organization_role_assignments.deleted_at` (0029): every
 * existing row has no rescission, so `NULL` is exactly its current implicit
 * state (openspec 0170).
 */
export const organizationInviteRescission: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('organization_invites')
      .addColumn('rescinded_at', 'timestamptz')
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('organization_invites').dropColumn('rescinded_at').execute();
  },
};
