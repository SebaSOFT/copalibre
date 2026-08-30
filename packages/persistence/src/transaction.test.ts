import { jest } from '@jest/globals';
import type { Kysely } from 'kysely';
import { recordAuditRefusal, type AuditRefusalEntry } from './transaction.js';
import type { Database } from './schema.js';

const ENTRY: AuditRefusalEntry = {
  organizationId: 'org-1',
  entityType: 'http-request',
  entityId: 'POST /x',
  action: 'authorization.refused',
  actor: 'user:1',
  authorizationContext: 'copalibre.control',
  reason: 'Requires capability "org.manage-clubs"',
};

function fakeDb(execute: () => Promise<unknown>): Kysely<Database> {
  const values = jest.fn().mockReturnValue({ execute });
  const insertInto = jest.fn().mockReturnValue({ values });
  return { insertInto } as unknown as Kysely<Database>;
}

describe('recordAuditRefusal', () => {
  it('writes a refusal row with no resultingState and a required reason', async () => {
    const execute = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ execute });
    const insertInto = jest.fn().mockReturnValue({ values });
    const db = { insertInto } as unknown as Kysely<Database>;

    await recordAuditRefusal(db, ENTRY);

    expect(insertInto).toHaveBeenCalledWith('audit_log');
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        action: 'authorization.refused',
        actor: 'user:1',
        reason: ENTRY.reason,
        resulting_state: null,
      }),
    );
  });

  it('never rejects when the write fails, and reports the failure instead', async () => {
    const failure = new Error('connection reset');
    const db = fakeDb(() => Promise.reject(failure));
    const onFailure = jest.fn();

    await expect(recordAuditRefusal(db, ENTRY, onFailure)).resolves.toBeUndefined();
    expect(onFailure).toHaveBeenCalledWith(failure);
  });

  it('logs to the console by default when no failure handler is supplied', async () => {
    const failure = new Error('connection reset');
    const db = fakeDb(() => Promise.reject(failure));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(recordAuditRefusal(db, ENTRY)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
