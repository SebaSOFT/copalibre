import { Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { AuditAction } from '@copalibre/domain';
import { recordAuditRead, type Database } from '@copalibre/persistence';
import type { AuthenticatedSubject } from '../auth/request-context.js';

const logger = new Logger('SensitiveReadAudit');

/**
 * Records a sensitive read (a bulk export, a personal-data read) — the
 * shared wiring three controllers use, so actor/authorizationContext
 * derivation and the best-effort failure handler are written once. A
 * subject is always present here: every route this is called from already
 * requires one to have reached its handler at all.
 */
export async function recordSensitiveRead(
  db: Kysely<Database>,
  entry: {
    readonly organizationId: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly action: AuditAction;
    readonly subject: AuthenticatedSubject | undefined;
  },
): Promise<void> {
  await recordAuditRead(
    db,
    {
      organizationId: entry.organizationId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actor: `user:${entry.subject?.principalId ?? entry.subject?.subjectId ?? 'unknown'}`,
      authorizationContext: (entry.subject?.scopes ?? []).join(' '),
    },
    (error) => logger.error('Failed to record a sensitive-read audit entry', error as Error),
  );
}
