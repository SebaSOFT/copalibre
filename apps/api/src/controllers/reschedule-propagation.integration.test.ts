import type { INestApplication } from '@nestjs/common';
import { ScheduleRepository, withTransaction } from '@copalibre/persistence';
import {
  seedScheduledTournament,
  scheduleAudit,
} from '../../../../packages/persistence/src/test-support/scheduled-tournament.js';
import { PublicProjectionsController } from './public-projections.controller.js';
import { buildTestApp } from './test-support/integration-harness.js';

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];
let organizationId: string;
beforeAll(async () => {
  ({ app, scratch, request, organizationId } = await buildTestApp([PublicProjectionsController]));
});
afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

it('projects the same previous placement on overview, matches view and report, clearing it once play starts', async () => {
  const seeded = await seedScheduledTournament(scratch.db, organizationId, 'copa-reprogramada');
  const schedules = new ScheduleRepository(scratch.db);
  const place = (slotId: string) =>
    withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        ...scheduleAudit,
        assignments: [{ matchId: seeded.matchId, slotId }],
        reason: { text: 'Cambio de cancha' },
      }),
    );
  const base = '/organizations/liga-orbital/tournaments/copa-reprogramada';
  await place(seeded.first.slotId);
  let report = await request({ method: 'GET', url: `${base}/stages/1/matches/1` });
  expect(report.statusCode).toBe(200);
  expect(report.json().rescheduledFrom).toBeNull();
  await place(seeded.second.slotId);
  for (const route of ['overview', 'matches-view', 'stages/1/matches/1']) {
    const response = await request({ method: 'GET', url: `${base}/${route}` });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const match =
      body.matches?.find((entry: { matchId: string }) => entry.matchId === seeded.matchId) ?? body;
    expect(match.scheduleVersion).toBe(2);
    expect(match.rescheduledFrom).toEqual({
      startsAt: seeded.first.startsAt,
      venue: { alias: 'copa-reprogramada-court-1', name: 'Cancha 1' },
    });
  }
  await scratch.db
    .updateTable('matches')
    .set({ status: 'in-progress' })
    .where('match_id', '=', seeded.matchId)
    .execute();
  report = await request({ method: 'GET', url: `${base}/stages/1/matches/1` });
  expect(report.json().rescheduledFrom).toBeNull();
  const live = await request({ method: 'GET', url: `${base}/live` });
  expect(live.json().matches[0].rescheduledFrom).toBeNull();
});
