import { OutboxRelay, withTransaction, type ClaimedJob } from '@copalibre/persistence';
import { randomUUID } from 'node:crypto';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import type { EmailDeliveryConfig, FetchLike } from '../invitations/email-delivery.js';
import { JobDispatcher } from '../jobs/dispatcher.js';
import { runRelayPass } from '../jobs/relay-runner.js';
import { invitationEmailHandler, passwordResetEmailHandler } from './account-handlers.js';
import { LIFECYCLE_EMAIL_EVENTS, lifecycleEmailHandlers } from './lifecycle-handlers.js';

/**
 * Lifecycle, invitation and password-reset email, through the real relay and real PostgreSQL.
 *
 * Recipient resolution is SQL over role assignments, and "never the same email twice" is a claim
 * about an atomic insert under concurrency, so a mock of either would prove the mock.
 */

const CONFIG: EmailDeliveryConfig = {
  provider: 'resend',
  appUrl: 'https://liga.example',
  from: 'noreply@liga.example',
  apiKey: 'key',
};

const fast = { baseSeconds: 0, factor: 1, maxDelaySeconds: 0, maxAttempts: 5, jitter: 0 };

interface Sent {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

describe('email notifications through the relay (integration)', () => {
  let scratch: ScratchDatabase;
  let relay: OutboxRelay;
  let sent: Sent[];
  let failFor: Set<string>;
  let hangFor: Set<string>;
  let warnings: string[];

  const organizationEs = randomUUID();
  const organizationEn = randomUUID();
  const emptyOrganization = randomUUID();
  const tournamentA = randomUUID();
  const tournamentB = randomUUID();
  const teamId = randomUUID();
  const entrantId = randomUUID();
  const principal: Record<string, string> = {};

  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      to: string[];
      subject: string;
      html: string;
      text: string;
    };
    const to = body.to[0] ?? '';
    if (hangFor.has(to)) throw new Error('socket hang up');
    if (failFor.has(to)) return new Response('', { status: 503 });
    sent.push({ to, subject: body.subject, html: body.html, text: body.text });
    return new Response('', { status: 202 });
  }) as FetchLike;

  function dispatcher(): JobDispatcher {
    const dependencies = {
      db: scratch.db,
      relay,
      fetcher,
      warn: (line: string) => warnings.push(line),
    };
    const lifecycle = lifecycleEmailHandlers(CONFIG, dependencies);
    const dispatch = new JobDispatcher()
      .register('organization.invite.requested', invitationEmailHandler(CONFIG, dependencies))
      .register('password-reset-requested', passwordResetEmailHandler(CONFIG, dependencies));
    for (const eventType of LIFECYCLE_EMAIL_EVENTS)
      dispatch.register(eventType, lifecycle[eventType]);
    return dispatch;
  }

  async function assign(
    organizationId: string,
    email: string,
    role: 'admin' | 'tournament-admin' | 'referee',
    options: { tournamentId?: string; status?: string; deleted?: boolean } = {},
  ): Promise<string> {
    const principalId = randomUUID();
    principal[email] = principalId;
    await scratch.db
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        email,
        oidc_subject_id: null,
        name: null,
        picture: null,
        password_hash: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    await scratch.db
      .insertInto('organization_role_assignments')
      .values({
        assignment_id: randomUUID(),
        organization_id: organizationId,
        principal_id: principalId,
        email,
        role,
        status: options.status ?? 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: options.deleted ? new Date() : null,
        club_id: null,
        tournament_id: options.tournamentId ?? null,
      })
      .execute();
    return principalId;
  }

  async function publish(
    eventType: string,
    organizationId: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const id = randomUUID();
    return withTransaction(scratch.db, (uow) =>
      uow.publishEvent({
        organizationId,
        stream: `test:${id}`,
        entityId: id,
        eventType,
        projectionVersion: 1,
        payload,
      }),
    );
  }

  async function pass(): Promise<Awaited<ReturnType<typeof runRelayPass>>> {
    return runRelayPass(relay, dispatcher(), {
      consumer: 'test-relay',
      worker: 'worker-1',
      backoff: fast,
    });
  }

  const recipients = (): string[] => sent.map((email) => email.to).sort();

  beforeAll(async () => {
    scratch = await createMigratedDatabase('worker-notifications');
    relay = new OutboxRelay(scratch.db);

    for (const [organization_id, alias, name, primary_language] of [
      [organizationEs, 'liga', 'Liga <Cuyana>', 'es'],
      [organizationEn, 'cup', 'Cup', 'en'],
      [emptyOrganization, 'vacia', 'Vacía', 'es'],
    ] as const) {
      await scratch.db
        .insertInto('organizations')
        .values({
          organization_id,
          alias,
          name,
          primary_language,
          timezone: 'UTC',
          created_at: new Date(),
        })
        .execute();
    }
    for (const [tournament_id, organization_id, alias, name] of [
      [tournamentA, organizationEs, 'apertura', 'Apertura 2026'],
      [tournamentB, organizationEs, 'clausura', 'Clausura 2026'],
    ] as const) {
      await scratch.db
        .insertInto('tournaments')
        .values({
          tournament_id,
          organization_id,
          alias,
          name,
          descriptor_id: tournament_id,
          descriptor_version: '1.0.0',
          ruleset_id: null,
          status: 'draft',
          started_at: null,
          profile_id: null,
          profile_version: null,
          created_at: new Date(),
        })
        .execute();
    }
    await scratch.db
      .insertInto('teams')
      .values({
        team_id: teamId,
        organization_id: organizationEs,
        alias: 'talleres',
        club_id: null,
        name: 'Talleres',
        discipline_id: null,
        abbreviation: null,
        created_at: new Date(),
      })
      .execute();
    await scratch.db
      .insertInto('entrants')
      .values({
        entrant_id: entrantId,
        tournament_id: tournamentA,
        entrant_kind: 'team',
        person_id: null,
        team_id: teamId,
        abbreviation: null,
        seed: null,
        status: 'pending',
        created_at: new Date(),
      })
      .execute();

    await assign(organizationEs, 'admin1@liga.example', 'admin');
    await assign(organizationEs, 'Admin2@liga.example', 'admin');
    await assign(organizationEs, 'inactive@liga.example', 'admin', { status: 'inactive' });
    await assign(organizationEs, 'removed@liga.example', 'admin', { deleted: true });
    await assign(organizationEs, 'tadmin-a@liga.example', 'tournament-admin', {
      tournamentId: tournamentA,
    });
    await assign(organizationEs, 'tadmin-b@liga.example', 'tournament-admin', {
      tournamentId: tournamentB,
    });
    await assign(organizationEs, 'referee@liga.example', 'referee');
    await assign(organizationEn, 'owner@cup.example', 'admin');
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(() => {
    sent = [];
    failFor = new Set();
    hangFor = new Set();
    warnings = [];
  });

  it('tells every active organization admin about a new club, in the organization language', async () => {
    await publish('club.created', organizationEs, {
      clubId: randomUUID(),
      alias: 'talleres',
      name: 'Talleres',
      actor: 'user:someone-else',
    });
    await pass();

    expect(recipients()).toEqual(['Admin2@liga.example', 'admin1@liga.example']);
    const [first] = sent;
    expect(first?.subject).toBe('Nuevo club: Talleres');
    expect(first?.html).toContain('<html lang="es">');
    expect(first?.html).toContain('>Liga &lt;Cuyana&gt;</span>');
    expect(first?.html).toContain('href="https://liga.example/es/liga"');
    expect(first?.html).toContain('https://liga.example/control/liga/clubs');
    expect(first?.html).toContain('https://copalibre.app');
  });

  it('writes in English for an English-language organization', async () => {
    await publish('club.created', organizationEn, {
      clubId: randomUUID(),
      name: 'Rovers',
      actor: 'x',
    });
    await pass();
    expect(sent.map((email) => email.subject)).toEqual(['New club: Rovers']);
  });

  it('does not email the actor about their own action', async () => {
    await publish('club.created', organizationEs, {
      clubId: randomUUID(),
      name: 'Boca',
      actor: `user:${principal['admin1@liga.example']}`,
    });
    await pass();
    expect(recipients()).toEqual(['Admin2@liga.example']);
  });

  it('adds only the tournament admins of that tournament when an entrant registers', async () => {
    await publish('entrant.registered', organizationEs, {
      entrantId,
      tournamentId: tournamentA,
      status: 'pending',
      entrantKind: 'team',
      actor: 'user:someone-else',
    });
    await pass();

    expect(recipients()).toEqual([
      'Admin2@liga.example',
      'admin1@liga.example',
      'tadmin-a@liga.example',
    ]);
    expect(sent[0]?.subject).toBe('Nueva inscripción: Talleres en Apertura 2026');
    expect(sent[0]?.html).toContain('/control/liga/tournaments/apertura/registrations');
  });

  it('reports the squad size, not the members, when a squad is submitted', async () => {
    await publish('entrant.squad-submitted', organizationEs, {
      entrantId,
      tournamentId: tournamentA,
      teamId,
      memberCount: 18,
      actor: 'user:someone-else',
    });
    await pass();

    expect(recipients()).toContain('tadmin-a@liga.example');
    expect(recipients()).not.toContain('tadmin-b@liga.example');
    expect(sent[0]?.subject).toBe('Plantel enviado: Talleres en Apertura 2026');
    expect(sent[0]?.text).toContain('Integrantes del plantel: 18');
  });

  it('announces a club-portal submission once: the squad event, not the registration event', async () => {
    await publish('entrant.registered', organizationEs, {
      entrantId,
      tournamentId: tournamentA,
      entrantKind: 'team',
      actor: 'x',
      origin: 'club-portal',
    });
    await pass();
    expect(sent).toHaveLength(0);
  });

  it('sends nothing for events caused by an import', async () => {
    for (const eventType of ['club.created', 'tournament.created', 'entrant.registered']) {
      await publish(eventType, organizationEs, {
        clubId: randomUUID(),
        name: 'Imported',
        tournamentId: tournamentA,
        entrantId,
        actor: 'x',
        origin: 'import',
      });
    }
    const result = await pass();
    expect(result.failed).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('completes without sending or failing when nobody qualifies', async () => {
    await publish('club.created', emptyOrganization, {
      clubId: randomUUID(),
      name: 'X',
      actor: 'x',
    });
    const result = await pass();
    expect(result).toMatchObject({ processed: 1, failed: 0 });
    expect(sent).toHaveLength(0);
  });

  it('never re-sends to a recipient that already received the email, even after a partial failure', async () => {
    failFor = new Set(['Admin2@liga.example']);
    await publish('club.created', organizationEs, {
      clubId: randomUUID(),
      name: 'River',
      actor: 'x',
    });

    const first = await pass();
    expect(first.failed).toBe(1);
    // The recipient before the refusal was already served; the refused one is not marked.
    expect(recipients()).toEqual(['admin1@liga.example']);

    failFor = new Set();
    // Backoff has a floor of one second; make the retry due now rather than sleeping.
    await scratch.db
      .updateTable('outbox_events')
      .set({ next_attempt_at: new Date(0) })
      .execute();
    await pass();
    const all = recipients();
    expect(all.filter((address) => address === 'Admin2@liga.example')).toHaveLength(1);
    expect(all.filter((address) => address === 'admin1@liga.example')).toHaveLength(1);
    expect(all).toHaveLength(2);
  });

  it('does not retry a recipient whose delivery outcome is unknown', async () => {
    hangFor = new Set(['admin1@liga.example']);
    await publish('club.created', organizationEs, {
      clubId: randomUUID(),
      name: 'Racing',
      actor: 'x',
    });

    const result = await pass();
    expect(result).toMatchObject({ processed: 1, failed: 0 });
    expect(warnings).toHaveLength(1);
    expect(recipients()).toEqual(['Admin2@liga.example']);

    hangFor = new Set();
    await pass();
    expect(recipients()).toEqual(['Admin2@liga.example']);
  });

  it('sends each recipient exactly once when two workers process the same event', async () => {
    const eventId = await publish('club.created', organizationEs, {
      clubId: randomUUID(),
      name: 'Independiente',
      actor: 'x',
    });
    const job = (await relay.claim({ worker: 'w', limit: 50 })).find(
      (row) => row.eventId === eventId,
    );
    expect(job).toBeDefined();
    const handlers = dispatcher();
    await Promise.all([handlers.dispatch(job as ClaimedJob), handlers.dispatch(job as ClaimedJob)]);
    expect(recipients()).toEqual(['Admin2@liga.example', 'admin1@liga.example']);
  });

  it('sends the invitation in the organization language, once, however often the row is delivered', async () => {
    const eventId = await publish('organization.invite.requested', organizationEs, {
      invitationId: randomUUID(),
      recipientEmail: 'new@liga.example',
      token: 'opaque',
      expiresAt: '2026-12-01T00:00:00.000Z',
    });
    const job = (await relay.claim({ worker: 'w', limit: 50 })).find(
      (row) => row.eventId === eventId,
    );
    const handlers = dispatcher();
    await handlers.dispatch(job as ClaimedJob);
    await handlers.dispatch(job as ClaimedJob);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe('Invitación a CopaLibre');
    expect(sent[0]?.html).toContain('token=opaque');
    expect(sent[0]?.html).toContain('>Liga &lt;Cuyana&gt;</span>');
  });

  it('sends the password reset in English with the Copa Libre mark only, once', async () => {
    // A reset is published under the system organization, which has no `organizations` row, so it
    // reaches the handler directly, as the dispatcher would hand it over. The marker still needs a
    // real outbox row, so one is published under an organization this test then ignores.
    const eventId = await publish('password-reset-requested', organizationEn, {});
    const job: ClaimedJob = {
      eventId,
      organizationId: '00000000-0000-0000-0000-000000000000',
      stream: 'principal:p',
      entityId: randomUUID(),
      eventType: 'password-reset-requested',
      projectionVersion: 1,
      payload: {
        verificationId: randomUUID(),
        recipientEmail: 'operator@liga.example',
        token: 'reset-token',
        expiresAt: '2026-12-01T00:00:00.000Z',
      },
      createdAt: new Date().toISOString(),
      attempts: 1,
      claimedBy: 'w',
      failures: [],
    };
    const handlers = dispatcher();
    await handlers.dispatch(job);
    await handlers.dispatch(job);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe('CopaLibre password reset');
    expect(sent[0]?.html).toContain('alt="Copa Libre" width="40"');
    expect(sent[0]?.html).toContain('token=reset-token');
  });
});
