import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  OrganizationRepository,
  OutboxRelay,
  ScheduleRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { randomUUID } from 'node:crypto';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import type { EmailDeliveryConfig, FetchLike } from '../invitations/email-delivery.js';
import { JobDispatcher } from '../jobs/dispatcher.js';
import { runRelayPass } from '../jobs/relay-runner.js';
import { RESCHEDULE_EMAIL_EVENT, rescheduleEmailHandler } from './reschedule-handler.js';

/**
 * Reschedule emails from a real published batch, through the real relay and reservation: the
 * schedule repository writes the `schedule.published` summary, the worker reads it.
 */

const CONFIG: EmailDeliveryConfig = {
  provider: 'resend',
  appUrl: 'https://liga.example',
  from: 'noreply@liga.example',
  apiKey: 'key',
};
const fast = { baseSeconds: 0, factor: 1, maxDelaySeconds: 0, maxAttempts: 5, jitter: 0 };
const HOUR = 60 * 60_000;

describe('reschedule email through the relay (integration)', () => {
  let scratch: ScratchDatabase;
  let relay: OutboxRelay;
  let sent: { to: string; subject: string; text: string }[];
  let failFor: Set<string>;
  let organizationId = '';
  let actorId = '';
  let matches: string[] = [];
  let slots: string[] = [];
  const audit = () => ({
    organizationId,
    actor: `user:${actorId}`,
    authorizationContext: 'test',
  });

  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string; text: string };
    const to = body.to[0] ?? '';
    if (failFor.has(to)) return new Response('', { status: 503 });
    sent.push({ to, subject: body.subject, text: body.text });
    return new Response('', { status: 202 });
  }) as FetchLike;

  const pass = () =>
    runRelayPass(
      relay,
      new JobDispatcher().register(
        RESCHEDULE_EMAIL_EVENT,
        rescheduleEmailHandler(CONFIG, { db: scratch.db, relay, fetcher }),
      ),
      { consumer: 'test-relay', worker: 'worker-1', backoff: fast },
    );

  async function assign(
    email: string,
    role: 'club-admin' | 'tournament-admin',
    scope: { clubId?: string; tournamentId?: string },
  ): Promise<string> {
    const principalId = randomUUID();
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
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        club_id: scope.clubId ?? null,
        tournament_id: scope.tournamentId ?? null,
      })
      .execute();
    return principalId;
  }

  const publish = (
    input: Omit<
      Parameters<ScheduleRepository['publishSchedule']>[1],
      'organizationId' | 'actor' | 'authorizationContext'
    >,
  ) =>
    withTransaction(scratch.db, (uow) =>
      new ScheduleRepository(scratch.db).publishSchedule(uow, { ...input, ...audit() }),
    );

  beforeAll(async () => {
    scratch = await createMigratedDatabase('worker-reschedule');
    relay = new OutboxRelay(scratch.db);
    const setup = { actor: 'user:seed', authorizationContext: 'seed' };
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-mendocina',
        name: 'Liga Mendocina',
        ...setup,
      }),
    );
    organizationId = organization.organizationId;
    await scratch.db
      .updateTable('organizations')
      .set({ primary_language: 'es', timezone: 'America/Argentina/Mendoza' })
      .where('organization_id', '=', organizationId)
      .execute();
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const tournaments = new TournamentRepository(scratch.db);
    const schedules = new ScheduleRepository(scratch.db);
    const seeded = await withTransaction(scratch.db, async (uow) => {
      const descriptor = footballDescriptor();
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...setup });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'apertura',
        name: 'Apertura 2026',
        descriptor,
        ...setup,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Liga',
        format: 'round-robin',
        organizationId,
        ...setup,
      });
      const clubs: string[] = [];
      const entrants: string[] = [];
      for (const name of ['Andes', 'Bravo', 'Cóndor']) {
        const club = await enrollment.createClub(uow, { organizationId, name, ...setup });
        const team = await enrollment.createTeam(uow, {
          organizationId,
          name,
          clubId: club.clubId,
          ...setup,
        });
        const entrant = await enrollment.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...setup,
        });
        clubs.push(club.clubId);
        entrants.push(entrant.entrantId);
      }
      const [a, b, c] = entrants as [string, string, string];
      const fixtures = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          { round: 1, homeEntrantId: a, awayEntrantId: b },
          { round: 2, homeEntrantId: b, awayEntrantId: c },
        ],
        organizationId,
        ...setup,
      });
      const stageMatches = await competition.listMatchesForStage(stage.stageId, uow);
      const venue = await schedules.createVenue(uow, {
        organizationId,
        alias: 'malvinas',
        name: 'Estadio Malvinas',
        concurrentCapacity: 2,
        ...setup,
      });
      const startsAt = Date.UTC(2026, 10, 14, 17, 30);
      const schedule = await schedules.createSchedule(uow, {
        organizationId,
        name: 'Fecha 1',
        startsAt,
        endsAt: startsAt + 8 * HOUR,
        slotMinutes: 120,
        turnaroundMinutes: 0,
        venueIds: [venue.venueId],
        ...setup,
      });
      return {
        tournamentId: tournament.tournamentId,
        clubs,
        matches: fixtures.map(
          (fixture) =>
            stageMatches.find((match) => match.fixtureId === fixture.fixtureId)?.matchId as string,
        ),
        slots: (await schedules.listScheduleSlots(schedule.scheduleId, uow)).map(
          (slot) => slot.slotId,
        ),
      };
    });
    matches = seeded.matches;
    slots = seeded.slots;
    const [andes, bravo, condor] = seeded.clubs as [string, string, string];
    await assign('andes@club.example', 'club-admin', { clubId: andes });
    await assign('bravo@club.example', 'club-admin', { clubId: bravo });
    await assign('condor@club.example', 'club-admin', { clubId: condor });
    await assign('torneo@liga.example', 'tournament-admin', { tournamentId: seeded.tournamentId });
    actorId = await assign('organizador@liga.example', 'tournament-admin', {
      tournamentId: seeded.tournamentId,
    });
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    sent = [];
    failFor = new Set();
    // Each case starts from a clean relay: earlier batches are already consumed.
    await pass();
    sent = [];
  });

  it('sends nothing for a first placement, then one email per recipient for a batch of moves', async () => {
    const [first, second] = matches as [string, string];
    await publish({
      assignments: [
        { matchId: first, slotId: slots[0] as string },
        { matchId: second, slotId: slots[1] as string },
      ],
    });
    await pass();
    expect(sent).toEqual([]);

    await publish({
      reason: { text: 'Cancha 1 sin luz' },
      assignments: [
        { matchId: first, slotId: slots[2] as string },
        {
          matchId: second,
          slotId: slots[3] as string,
          reason: { code: 'weather', text: 'Clima' },
        },
      ],
    });
    await pass();
    expect(sent.map((email) => email.to).sort()).toEqual([
      'andes@club.example',
      'bravo@club.example',
      'condor@club.example',
      'torneo@liga.example',
    ]);
    const bravo = sent.find((email) => email.to === 'bravo@club.example');
    expect(bravo?.subject).toBe('Cambió el horario: Apertura 2026');
    expect(bravo?.text).toContain('Cambiaron 2 de tus partidos.');
    expect(bravo?.text).toContain('Motivo: Cancha 1 sin luz');
    expect(bravo?.text).toContain('Motivo: Clima');
    expect(bravo?.text).toMatch(/Andes vs Bravo: .*14:30.*Estadio Malvinas → .*18:30/);
    const andes = sent.find((email) => email.to === 'andes@club.example');
    expect(andes?.text).toContain('Cambió uno de tus partidos.');
    expect(andes?.text).not.toContain('Cóndor');
  });

  it('never sends a recipient the same batch twice, even after a partial failure', async () => {
    const [first] = matches as [string];
    failFor = new Set(['bravo@club.example']);
    await publish({
      reason: { text: 'Pedido del club' },
      assignments: [{ matchId: first, slotId: slots[0] as string }],
    });
    const attempt = await pass();
    expect(attempt.failed).toBe(1);
    const firstRound = sent.map((email) => email.to).sort();
    expect(firstRound).not.toContain('bravo@club.example');

    failFor = new Set();
    await scratch.db
      .updateTable('outbox_events')
      .set({ next_attempt_at: new Date(0) })
      .execute();
    await pass();
    const all = sent.map((email) => email.to).sort();
    expect(all).toEqual(['andes@club.example', 'bravo@club.example', 'torneo@liga.example']);
  });

  it('sends nothing for a batch from an import or demo loading', async () => {
    const [first] = matches as [string];
    await publish({
      origin: 'import',
      reason: { text: 'Carga de demostración' },
      assignments: [{ matchId: first, slotId: slots[1] as string }],
    });
    await pass();
    expect(sent).toEqual([]);
  });
});
