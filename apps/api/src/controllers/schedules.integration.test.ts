import type { INestApplication } from '@nestjs/common';
import { buildTestApp } from './test-support/integration-harness.js';
import { SchedulesController } from './schedules.controller.js';

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];

beforeAll(async () => {
  ({ app, scratch, request } = await buildTestApp([SchedulesController]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

describe('scheduling routes', () => {
  const scheduleUrl = (stageId: string, suffix = '') =>
    `/organizations/liga-orbital/tournaments/no-such-copa/stages/${stageId}/schedule${suffix}`;

  it('404s a schedule under a tournament that does not exist', async () => {
    const response = await request({ method: 'GET', url: scheduleUrl('stage-1') });
    expect(response.statusCode).toBe(404);
  });

  it('refuses a preview without a token, because a dry run still reads the draft', async () => {
    const response = await request({
      method: 'POST',
      url: scheduleUrl('stage-1', '/preview'),
      payload: { assignments: [] },
    });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a publish without a token', async () => {
    const response = await request({
      method: 'POST',
      url: scheduleUrl('stage-1'),
      payload: { assignments: [] },
    });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a publish from an organizer of another organization', async () => {
    const response = await request({
      method: 'POST',
      url: scheduleUrl('stage-1'),
      token: 'organizer-org2',
      payload: { assignments: [] },
    });
    // 404 here: the tournament alias does not exist, and the caller learns
    // nothing about another organization's data either way.
    expect([403, 404]).toContain(response.statusCode);
  });

  it('refuses a participant token on the control plane', async () => {
    const response = await request({
      method: 'POST',
      url: scheduleUrl('stage-1', '/preview'),
      token: 'participant-org1',
      payload: { assignments: [] },
    });
    expect([403, 404]).toContain(response.statusCode);
  });

  it('400s a publish without an assignments array, before reaching the controller', async () => {
    const response = await request({
      method: 'POST',
      url: scheduleUrl('stage-1'),
      token: 'organizer-org1',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('strips an extra undocumented property and keeps the non-validation status', async () => {
    const response = await request({
      method: 'POST',
      url: scheduleUrl('stage-1'),
      token: 'organizer-org2',
      payload: { assignments: [], unexpectedField: 'dropped' },
    });
    // Guards run before pipes: the outcome is the same cross-organization 403/404
    // the well-formed payload gets — never a validation error.
    expect([403, 404]).toContain(response.statusCode);
  });
});
