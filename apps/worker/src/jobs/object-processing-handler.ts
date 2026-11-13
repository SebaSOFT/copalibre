import { Readable } from 'node:stream';
import {
  EMBLEM_RENDITION_CONTENT_TYPE,
  EMBLEM_RENDITION_WIDTHS,
  emblemRenditionKey,
  hasEmblemRenditions,
  renderEmblemRendition,
  type ObjectStorageAdapter,
} from '@copalibre/object-storage';
import {
  ObjectMetadataRepository,
  OBJECT_PROCESSING_REQUESTED_EVENT,
  withTransaction,
  type ClaimedJob,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { JobHandler } from './dispatcher.js';
import { payloadOf } from './relay-runner.js';

/** The narrow surface this handler needs from `clamscan`'s `NodeClam` — real scanning verified against real `clamd` in the integration suite. */
export interface ObjectScanner {
  scanStream(stream: Readable): Promise<{ isInfected: boolean; viruses: string[] }>;
}

/**
 * Async media processing for the object-storage capability's own registry:
 * malware scan, then — for a raster image — the WebP renditions the
 * emblem routes serve. `object_metadata` starts every row `pending`; this is
 * the only writer of `passed`/`failed` for a row it owns.
 */
export function objectProcessingHandler(input: {
  readonly db: Kysely<Database>;
  readonly storage: ObjectStorageAdapter;
  readonly scanner: ObjectScanner;
}): JobHandler {
  const metadata = new ObjectMetadataRepository(input.db);

  return async (job: ClaimedJob): Promise<void> => {
    if (job.eventType !== OBJECT_PROCESSING_REQUESTED_EVENT) return;
    const { objectId } = payloadOf<{ objectId?: unknown }>(job);
    if (typeof objectId !== 'string') {
      throw new Error('Object processing job has no objectId');
    }

    const object = await metadata.findById(objectId);
    if (!object || object.status !== 'pending') return;

    const stored = await input.storage.get({ key: object.storageKey });
    const scan = await input.scanner.scanStream(Readable.from(Buffer.from(stored.body)));

    if (scan.isInfected) {
      await withTransaction(input.db, (uow) =>
        metadata.markFailed(
          uow,
          objectId,
          scan.viruses.length > 0 ? scan.viruses.join(', ') : 'flagged by malware scan',
          {
            organizationId: object.organizationId,
            actor: 'object-processing-worker',
            authorizationContext: 'system:object.scan',
          },
        ),
      );
      return;
    }

    if (hasEmblemRenditions(object.contentType)) {
      // Derived, regeneratable from the original — no metadata row of their
      // own: only the source object is authoritative. The API makes any
      // missing one on request, from the same function.
      for (const width of EMBLEM_RENDITION_WIDTHS) {
        await input.storage.put(
          emblemRenditionKey(object.storageKey, width),
          await renderEmblemRendition(stored.body, width),
          EMBLEM_RENDITION_CONTENT_TYPE,
        );
      }
    }

    await metadata.markPassed(objectId);
  };
}
