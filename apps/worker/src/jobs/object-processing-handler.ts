import { Readable } from 'node:stream';
import type { ObjectStorageAdapter } from '@copalibre/object-storage';
import {
  ObjectMetadataRepository,
  OBJECT_PROCESSING_REQUESTED_EVENT,
  withTransaction,
  type ClaimedJob,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import sharp from 'sharp';
import type { JobHandler } from './dispatcher.js';
import { payloadOf } from './relay-runner.js';

/** The narrow surface this handler needs from `clamscan`'s `NodeClam` — real scanning verified against real `clamd` in the integration suite. */
export interface ObjectScanner {
  scanStream(stream: Readable): Promise<{ isInfected: boolean; viruses: string[] }>;
}

const THUMBNAIL_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const THUMBNAIL_MAX_DIMENSION = 320;

/**
 * Async media processing for the object-storage capability's own registry
 * (0041 task 2): malware scan, then — for an image content type — a
 * thumbnail rendition. `object_metadata` starts every row `pending`; this is
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

    if (THUMBNAIL_CONTENT_TYPES.has(object.contentType)) {
      const thumbnail = await sharp(Buffer.from(stored.body))
        .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toBuffer();
      // Derived, regeneratable from the original — no metadata row of its
      // own, matching module-distribution's own asset-vs-derived-output
      // distinction: only the source object is authoritative.
      await input.storage.put(`${object.storageKey}.thumbnail`, thumbnail, object.contentType);
    }

    await metadata.markPassed(objectId);
  };
}
