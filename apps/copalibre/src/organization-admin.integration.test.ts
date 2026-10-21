import { OrganizationRepository, withTransaction } from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../packages/persistence/src/test-support/scratch-database.js';
import { createOrganizationAdminInvitation } from './organization-admin.js';

describe('organization add-admin', () => {
  let scratch: ScratchDatabase;

  beforeEach(async () => {
    scratch = await createMigratedDatabase('organization-add-admin');
  });

  afterEach(async () => {
    await scratch.drop();
  });

  it('creates an audited administrator invitation without creating credentials', async () => {
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'demo-league',
        name: 'Demo League',
        actor: 'test:organization-add-admin',
        authorizationContext: 'test-fixture',
      }),
    );

    const invitation = await createOrganizationAdminInvitation(
      scratch.db,
      organization.alias,
      'admin@example.test',
      'https://copalibre.example.test',
      new Date('2026-10-21T12:00:00.000Z'),
    );
    const storedInvitation = await scratch.db
      .selectFrom('organization_invites')
      .select(['invitation_id', 'recipient_email', 'role', 'token_hash', 'expires_at'])
      .where('invitation_id', '=', invitation.invitationId)
      .executeTakeFirstOrThrow();
    const audit = await scratch.db
      .selectFrom('audit_log')
      .select(['action', 'actor', 'authorization_context', 'resulting_state'])
      .where('entity_id', '=', invitation.invitationId)
      .executeTakeFirstOrThrow();
    const inviteEvent = await scratch.db
      .selectFrom('outbox_events')
      .select('payload')
      .where('entity_id', '=', invitation.invitationId)
      .where('event_type', '=', 'organization.invite.requested')
      .executeTakeFirstOrThrow();
    const principals = await scratch.db
      .selectFrom('identity_principals')
      .select('principal_id')
      .execute();

    expect(storedInvitation).toMatchObject({
      recipient_email: 'admin@example.test',
      role: 'admin',
      expires_at: new Date('2026-11-20T12:00:00.000Z'),
    });
    expect(invitation.setupUrl).toMatch(
      /^https:\/\/copalibre\.example\.test\/invitations\/accept\?token=/,
    );
    const token = new URL(invitation.setupUrl).searchParams.get('token');
    expect(token).toBeTruthy();
    expect(storedInvitation.token_hash).not.toBe(token);
    expect(storedInvitation.token_hash).toHaveLength(64);
    expect(audit).toMatchObject({
      action: 'organization.invitation-created',
      actor: 'operator:cli',
      authorization_context: 'direct-database',
    });
    expect(inviteEvent.payload.token).toBe(token);
    expect(principals).toEqual([]);
    expect(JSON.stringify(audit.resulting_state)).not.toContain('password');
  });
});
