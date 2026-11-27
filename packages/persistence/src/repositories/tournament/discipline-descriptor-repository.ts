import { resolveLabel, type DisciplineDescriptor } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';

/** Discipline descriptors and the started tournaments that reference them. */
export class DisciplineDescriptorRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async saveDescriptor(
    uow: UnitOfWork,
    descriptor: DisciplineDescriptor,
    context: {
      readonly organizationId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<DisciplineDescriptor> {
    const inserted = await uow.tx
      .insertInto('discipline_descriptors')
      .values({
        descriptor_id: descriptor.descriptorId,
        alias: descriptor.alias,
        version: descriptor.version,
        name: resolveLabel(descriptor.name, 'en'),
        document: JSON.stringify(descriptor),
        created_at: new Date(),
      })
      .onConflict((oc) => oc.columns(['descriptor_id', 'version']).doNothing())
      .returning('descriptor_id')
      .executeTakeFirst();

    if (!inserted) return descriptor;

    await uow.recordAudit({
      organizationId: context.organizationId,
      entityType: 'discipline-descriptor',
      entityId: descriptor.descriptorId,
      action: 'descriptor.published',
      actor: context.actor,
      authorizationContext: context.authorizationContext,
      resultingState: {
        descriptorId: descriptor.descriptorId,
        alias: descriptor.alias,
        version: descriptor.version,
      },
    });
    await uow.publishEvent({
      organizationId: context.organizationId,
      stream: `discipline-descriptor:${descriptor.descriptorId}`,
      entityId: descriptor.descriptorId,
      eventType: 'discipline-descriptor.published',
      projectionVersion: 1,
      payload: {
        descriptorId: descriptor.descriptorId,
        alias: descriptor.alias,
        version: descriptor.version,
      },
    });

    return descriptor;
  }

  async findDescriptor(
    descriptorId: string,
    version: string,
  ): Promise<DisciplineDescriptor | undefined> {
    const row = await this.db
      .selectFrom('discipline_descriptors')
      .select('document')
      .where('descriptor_id', '=', descriptorId)
      .where('version', '=', version)
      .executeTakeFirst();
    return row ? (row.document as unknown as DisciplineDescriptor) : undefined;
  }

  /** Looks up an installed descriptor by its catalogue identity. */
  async findDescriptorByAlias(
    alias: string,
    version: string,
  ): Promise<DisciplineDescriptor | undefined> {
    const row = await this.db
      .selectFrom('discipline_descriptors')
      .select('document')
      .where('alias', '=', alias)
      .where('version', '=', version)
      .executeTakeFirst();
    return row ? (row.document as unknown as DisciplineDescriptor) : undefined;
  }

  /** Every installed version under an alias, used to protect reserved names. */
  async findDescriptorVersionsByAlias(alias: string): Promise<readonly DisciplineDescriptor[]> {
    const rows = await this.db
      .selectFrom('discipline_descriptors')
      .select('document')
      .where('alias', '=', alias)
      .orderBy('version')
      .execute();
    return rows.map((row) => row.document as unknown as DisciplineDescriptor);
  }

  /**
   * Every installed discipline, newest version of each.
   *
   * The wizard reads its options from here rather than from a list in the
   * client: a hardcoded list is a list that disagrees with the installation the
   * day somebody adds a module.
   */
  async listDescriptors(): Promise<
    readonly {
      readonly descriptorId: string;
      readonly version: string;
      readonly document: DisciplineDescriptor;
    }[]
  > {
    const rows = await this.db
      .selectFrom('discipline_descriptors')
      .select(['descriptor_id', 'version', 'document'])
      .orderBy('descriptor_id')
      .orderBy('version', 'desc')
      .execute();

    const newest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!newest.has(row.descriptor_id)) newest.set(row.descriptor_id, row);

    return [...newest.values()].map((row) => ({
      descriptorId: row.descriptor_id,
      version: row.version,
      document: row.document as unknown as DisciplineDescriptor,
    }));
  }

  /**
   * Tournament aliases (started or finished) naming this exact descriptor
   * version — the `module remove` safety check, distinct from
   * `retirableDescriptorVersions`'s catalogue-retirement question: this asks
   * whether *deleting the row* would orphan a reference a tournament record
   * still names, not whether the version is worth keeping in a browsable
   * catalogue.
   */
  async findStartedTournamentAliasesReferencingDescriptor(
    descriptorId: string,
    version: string,
  ): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('tournaments')
      .select('alias')
      .where('descriptor_id', '=', descriptorId)
      .where('descriptor_version', '=', version)
      .where('status', 'in', ['started', 'finished'])
      .execute();
    return rows.map((row) => row.alias);
  }

  /** Same question as above, for a profile version. */
  async findStartedTournamentAliasesReferencingProfile(
    profileId: string,
    version: string,
  ): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('tournaments')
      .select('alias')
      .where('profile_id', '=', profileId)
      .where('profile_version', '=', version)
      .where('status', 'in', ['started', 'finished'])
      .execute();
    return rows.map((row) => row.alias);
  }
}
