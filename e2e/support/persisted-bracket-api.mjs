// A real API and portable database for the browser's undecided-final scheduling journey.
import process from 'node:process';
import { buildTestApp } from '../../apps/api/dist/controllers/test-support/integration-harness.js';
import { SeedingController } from '../../apps/api/dist/controllers/seeding.controller.js';
import { StagesController } from '../../apps/api/dist/controllers/stages.controller.js';
import { SchedulesController } from '../../apps/api/dist/controllers/schedules.controller.js';
import { ResourcesController } from '../../apps/api/dist/controllers/resources.controller.js';
import { zoneEntrantResolution } from '../../apps/api/dist/zone-entrant-resolution.js';
import {
  CompetitionRepository,
  EnrollmentRepository,
  ScheduleRepository,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import { footballDescriptor } from '@copalibre/domain';
import { registerTestDatabase } from '../../packages/persistence/dist/test-support/test-dialect.js';

const harness = await buildTestApp([
  SeedingController,
  StagesController,
  SchedulesController,
  ResourcesController,
]);
const { db } = harness.scratch;
// The compiled API and source scratch harness use separate module instances for this registry.
registerTestDatabase(db, 'sqlite');
const audit = {
  organizationId: harness.organizationId,
  actor: 'user:e2e',
  authorizationContext: 'test:setup',
};
const tournaments = new TournamentRepository(db);
const competition = new CompetitionRepository(db);
const enrollment = new EnrollmentRepository(db);
const schedules = new ScheduleRepository(db);
const alias = 'undecided-cup';
// `arisen-conflict`: a rest rule, and a quarter-final published right before its semi-final.
const scenario = process.env.PERSISTED_BRACKET_SCENARIO;
const base = `/organizations/liga-orbital/tournaments/${alias}`;
const entrantIds = [];
const descriptor = footballDescriptor();
const stage = await withTransaction(db, async (uow) => {
  await tournaments.saveDescriptor(uow, descriptor, audit);
  const tournament = await tournaments.create(uow, {
    ...audit,
    alias,
    name: 'Copa de eliminación',
    descriptor,
  });
  await tournaments.createRuleset(uow, {
    ...audit,
    tournamentId: tournament.tournamentId,
    descriptor,
    overrides: { format: 'single-elimination' },
  });
  for (let n = 1; n <= 8; n += 1) {
    const team = await enrollment.createTeam(uow, { ...audit, name: `Club ${n}` });
    const entrant = await enrollment.registerEntrant(uow, {
      ...audit,
      tournamentId: tournament.tournamentId,
      entrantRef: { kind: 'team', teamId: team.teamId },
    });
    await enrollment.setEntrantStatus(uow, {
      ...audit,
      entrantId: entrant.entrantId,
      status: 'accepted',
    });
    entrantIds.push(entrant.entrantId);
  }
  const stage = await competition.createStageInTournament(uow, {
    ...audit,
    tournamentId: tournament.tournamentId,
    number: 1,
    name: 'Copa',
    format: 'single-elimination',
  });
  const venue = await schedules.createVenue(uow, {
    ...audit,
    alias: 'court-1',
    name: 'Cancha 1',
    concurrentCapacity: 1,
  });
  await schedules.createSchedule(uow, {
    ...audit,
    name: 'Final',
    startsAt: Date.UTC(2026, 10, 7, 14),
    endsAt: Date.UTC(2026, 10, 7, scenario === 'arisen-conflict' ? 20 : 16),
    slotMinutes: 120,
    turnaroundMinutes: 0,
    venueIds: [venue.venueId],
  });
  if (scenario === 'arisen-conflict')
    await tournaments.setMinimumRest(uow, {
      ...audit,
      tournamentId: tournament.tournamentId,
      minimumRestMinutes: 60,
    });
  return stage;
});
const seeded = await harness.request({
  method: 'POST',
  url: `${base}/stages/1/seeding`,
  token: 'organizer-org1',
  payload: { seeds: entrantIds.map((entrantId, index) => ({ entrantId, seed: index + 1 })) },
});
if (seeded.statusCode !== 200) throw new Error(seeded.body);
const fixtures = await competition.listFixturesOfStage(stage.stageId);
if (fixtures.length !== 7) throw new Error('Expected seven persisted fixtures');
const final = fixtures.find((fixture) => fixture.round === 3);
const matches = await competition.listMatchesForStage(stage.stageId);
const finalMatch = matches.find((match) => match.fixtureId === final?.fixtureId);
if (!finalMatch || final.homeEntrantId || final.awayEntrantId)
  throw new Error('Expected an undecided final');
const rows = await db
  .selectFrom('fixtures')
  .innerJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
  .select([
    'fixtures.node_key',
    'fixtures.zone_id',
    'fixtures.home_entrant_id',
    'fixtures.away_entrant_id',
    'matches.match_id',
  ])
  .where('fixtures.stage_id', '=', stage.stageId)
  .execute();
const quarter = rows.find((row) => row.node_key === 'SE-R1-M1');
const semi = rows.find((row) => row.node_key === 'SE-R2-M1');
if (scenario === 'arisen-conflict') {
  // The semi-final is undecided, so its rest is not checked yet: both publish back to back.
  const [first, second] = await schedules.listScheduleSlots(
    (await schedules.listSchedules(harness.organizationId))[0].scheduleId,
  );
  await withTransaction(db, (uow) =>
    schedules.publishSchedule(uow, {
      ...audit,
      assignments: [
        { matchId: quarter.match_id, slotId: first.slotId },
        { matchId: semi.match_id, slotId: second.slotId },
      ],
    }),
  );
}
await harness.app.listen(0, '127.0.0.1');
process.send?.({
  url: await harness.app.getUrl(),
  stageId: stage.stageId,
  matchId: finalMatch.matchId,
});
process.on('message', async (message) => {
  if (message === 'finalize-quarter') {
    // The result path's own steps: record the outcome, then resolve the zone in one transaction.
    await withTransaction(db, async (uow) => {
      await competition.recordResult(uow, {
        ...audit,
        matchId: quarter.match_id,
        result: {
          sides: [
            { entrantId: quarter.home_entrant_id, statistics: { goals: 2 } },
            { entrantId: quarter.away_entrant_id, statistics: { goals: 0 } },
          ],
          winnerEntrantId: quarter.home_entrant_id,
          recordedAt: new Date().toISOString(),
        },
      });
      await zoneEntrantResolution(db).run(uow, quarter.zone_id, audit);
    });
    process.send?.('finalized');
  }
  if (message === 'close') {
    await harness.app.close();
    await harness.scratch.drop();
    process.exit(0);
  }
});
