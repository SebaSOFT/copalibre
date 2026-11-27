import { recordAuditRefusal } from './transaction.js';
import {
  recordSecurityAlert,
  refusalBursts,
  securityAlertRaisedSince,
} from './security-signals.js';
import { SYSTEM_ORGANIZATION } from './relay/scheduled-jobs.js';
import { createMigratedDatabase, type ScratchDatabase } from './test-support/scratch-database.js';

describe('security signals', () => {
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('security_signals');
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function refuse(actor: string, path: string, times: number) {
    for (let index = 0; index < times; index += 1) {
      await recordAuditRefusal(scratch.db, {
        organizationId: SYSTEM_ORGANIZATION,
        entityType: 'organization',
        entityId: SYSTEM_ORGANIZATION,
        action: 'authorization.refused',
        actor,
        authorizationContext: '',
        reason: 'Missing or invalid bearer token',
        previousState: { method: 'POST', path: `${path}?token=never-reported` },
      });
    }
  }

  it('reports only actors over the threshold, with their most refused paths and no query strings', async () => {
    const since = new Date(Date.now() - 60_000);
    await refuse('unauthenticated', '/api/auth/login', 12);
    await refuse('unauthenticated', '/api/admin/modules', 3);
    await refuse('user:0190f0c4-0000-7000-8000-000000000001', '/api/organizations', 2);

    const bursts = await refusalBursts(scratch.db, { since, threshold: 10 });

    expect(bursts).toEqual([
      {
        actor: 'unauthenticated',
        refusals: 15,
        topPaths: ['POST /api/auth/login', 'POST /api/admin/modules'],
      },
    ]);
    expect(JSON.stringify(bursts)).not.toContain('never-reported');
  });

  it('ignores refusals before the window', async () => {
    const bursts = await refusalBursts(scratch.db, {
      since: new Date(Date.now() + 60_000),
      threshold: 1,
    });
    expect(bursts).toEqual([]);
  });

  it('remembers a raised alert so one burst alerts once', async () => {
    const since = new Date(Date.now() - 60_000);
    expect(await securityAlertRaisedSince(scratch.db, 'unauthenticated', since)).toBe(false);
    await recordSecurityAlert(
      scratch.db,
      { actor: 'unauthenticated', refusals: 15, topPaths: ['POST /api/auth/login'] },
      10,
    );
    expect(await securityAlertRaisedSince(scratch.db, 'unauthenticated', since)).toBe(true);
    expect(await securityAlertRaisedSince(scratch.db, 'user:someone-else', since)).toBe(false);
  });
});
