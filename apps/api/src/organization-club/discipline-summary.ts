import { resolveLabel, type DisciplineDescriptor } from '@copalibre/domain';
import type { Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { PublicTournamentDisciplineSummaryResponse } from '../dto/public-tournament.dto.js';

/** Every installed discipline descriptor, by id, parsed once for a listing of tournaments. */
export async function loadDescriptorsById(
  db: Kysely<Database>,
): Promise<ReadonlyMap<string, DisciplineDescriptor>> {
  const rows = await db
    .selectFrom('discipline_descriptors')
    .select(['descriptor_id as descriptorId', 'document'])
    .execute();
  const descriptors = new Map<string, DisciplineDescriptor>();
  for (const row of rows) {
    descriptors.set(
      row.descriptorId,
      (typeof row.document === 'string'
        ? JSON.parse(row.document)
        : row.document) as DisciplineDescriptor,
    );
  }
  return descriptors;
}

/**
 * The discipline a public tournament listing names: the descriptor reference, its English name, and
 * its localized name when the descriptor declares one.
 */
export function disciplineSummaryOf(
  ref: { readonly descriptorId: string; readonly version: string },
  descriptor: DisciplineDescriptor | undefined,
): PublicTournamentDisciplineSummaryResponse {
  return {
    descriptorId: ref.descriptorId,
    version: ref.version,
    name: descriptor?.name ? resolveLabel(descriptor.name, 'en') : undefined,
    ...(descriptor?.name !== undefined && typeof descriptor.name !== 'string'
      ? { localizedName: descriptor.name }
      : {}),
  };
}
