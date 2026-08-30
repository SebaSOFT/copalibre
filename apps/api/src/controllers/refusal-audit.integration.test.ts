import { APP_GUARD } from '@nestjs/core';
import { OrganizationAccessGuard } from '../auth/organization-access.guard.js';
import { ClubsController } from './clubs.controller.js';
import { buildTestApp } from './test-support/integration-harness.js';

const GUARD_PROVIDERS = [{ provide: APP_GUARD, useClass: OrganizationAccessGuard }];

/**
 * The central exception filter's refusal recording (openspec 0166, tasks
 * 2.1/2.4), exercised through the real HTTP stack rather than at the unit
 * level, so the wiring — DI, the Fastify request shape, the real
 * `audit_log` table — is proven, not just the pure `refusalEntryFor` logic
 * `error-contract.test.ts` already covers.
 */
describe('refusal audit recording (integration)', () => {
  it('records an authorization refusal naming the actor and reason (task 6.2)', async () => {
    const { scratch, organizationId, request, app } = await buildTestApp(
      [ClubsController],
      GUARD_PROVIDERS,
    );
    try {
      const response = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/clubs`,
        token: 'organizer-org1',
        payload: { name: 'A New Club' },
      });
      expect(response.statusCode).toBe(403);

      const refusal = await scratch.db
        .selectFrom('audit_log')
        .selectAll()
        .where('entity_type', '=', 'organization')
        .where('entity_id', '=', organizationId)
        .where('action', '=', 'authorization.refused')
        .executeTakeFirst();

      expect(refusal).toBeDefined();
      expect(refusal?.actor).toBe('user:organizer-1');
      expect(refusal?.reason).toContain('installation principal');
      expect(refusal?.resulting_state).toBeNull();
    } finally {
      await app.close();
      await scratch.drop();
    }
  });

  it('names the absence rather than an invented actor for an unauthenticated refusal (task 2.4)', async () => {
    const { scratch, request, app } = await buildTestApp([ClubsController], GUARD_PROVIDERS);
    try {
      const response = await request({
        method: 'POST',
        url: `/organizations/liga-orbital/clubs`,
        payload: { name: 'A New Club' },
      });
      expect(response.statusCode).toBe(401);

      const refusal = await scratch.db
        .selectFrom('audit_log')
        .selectAll()
        .where('action', '=', 'authorization.refused')
        .where('actor', '=', 'unauthenticated')
        .executeTakeFirst();

      expect(refusal).toBeDefined();
    } finally {
      await app.close();
      await scratch.drop();
    }
  });
});
