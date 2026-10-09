import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { loadSchedule } from './schedule-loader.js';

const row = (matchNumber: number, stageNumber: number, zoneName: string, groupName?: string) => ({
  matchId: `m-${matchNumber}`,
  stageNumber,
  matchNumber,
  round: 1,
  status: 'final',
  homeName: 'A',
  awayName: 'B',
  zoneName,
  ...(groupName === undefined ? {} : { groupName }),
});

const bracketMatch = {
  matchId: 'cup-1',
  matchNumber: 3,
  bracket: 'winners',
  round: 1,
  position: 1,
  status: 'finalized',
  slots: [
    { kind: 'entrant', entrantId: 'a', name: 'A', score: 1 },
    { kind: 'entrant', entrantId: 'b', name: 'B', score: 0 },
  ],
};

/** A fake API: path (without query) to a JSON body; anything else is a 404. */
function serve(routes: Readonly<Record<string, unknown>>): void {
  global.fetch = jest.fn(async (input: unknown) => {
    const path = String(input).replace('http://api.test', '').split('?')[0] ?? '';
    const body = routes[path];
    return body === undefined
      ? ({ ok: false, status: 404, json: async () => ({}) } as Response)
      : ({ ok: true, status: 200, json: async () => body } as Response);
  }) as unknown as typeof fetch;
}

const BASE = '/organizations/liga/tournaments/apertura';

describe('loadSchedule', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.COPALIBRE_API_INTERNAL_URL = 'http://api.test';
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.COPALIBRE_API_INTERNAL_URL;
  });

  const routes = {
    [`${BASE}/completion`]: {
      stages: [
        { stageNumber: 1, stageName: 'Groups' },
        { stageNumber: 2, stageName: 'Cups' },
      ],
    },
    [`${BASE}/matches-view`]: {
      matches: [row(1, 1, 'Groups', 'A'), row(2, 1, 'Groups', 'B'), row(3, 2, 'Gold')],
    },
    [`${BASE}/stages/1/bracket`]: {
      format: 'round-robin',
      zones: [{ zoneName: 'Groups', format: 'round-robin', matches: [] }],
    },
    [`${BASE}/stages/2/bracket`]: {
      format: 'single-elimination',
      zones: [{ zoneName: 'Gold', format: 'single-elimination', matches: [bracketMatch] }],
    },
  };

  it('builds the hierarchy and draws a knockout zone as its bracket', async () => {
    serve(routes);
    const loaded = await loadSchedule({
      organization: 'liga',
      tournament: 'apertura',
      state: 'all',
    });

    expect(loaded?.stages.map((stage) => stage.stageName)).toEqual(['Groups', 'Cups']);
    expect(loaded?.stages[0]?.zones[0]?.kind).toBe('rows');
    expect(loaded?.stages[1]?.zones[0]?.kind).toBe('bracket');
    expect(loaded?.stageRows).toHaveLength(3);
  });

  it('applies the zone and group to the rows and never fetches a bracket for a state filter', async () => {
    serve(routes);
    const loaded = await loadSchedule({
      organization: 'liga',
      tournament: 'apertura',
      state: 'final',
      zone: 'Groups',
      group: 'B',
    });

    expect(loaded?.rows.map((one) => one.matchNumber)).toEqual([2]);
    expect(loaded?.stageRows).toHaveLength(3);
    expect(loaded?.stages).toHaveLength(1);
    const asked = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(asked.some((url) => url.includes('/bracket'))).toBe(false);
  });

  it('limits the stages to the requested one', async () => {
    serve(routes);
    const loaded = await loadSchedule({
      organization: 'liga',
      tournament: 'apertura',
      state: 'all',
      stageNumber: 2,
    });
    expect(loaded?.stages.map((stage) => stage.stageNumber)).toEqual([2]);
  });

  it('reads the stages off the matches when the tournament reports none', async () => {
    serve({ ...routes, [`${BASE}/completion`]: { stages: [] } });
    const loaded = await loadSchedule({
      organization: 'liga',
      tournament: 'apertura',
      state: 'all',
    });
    expect(loaded?.stageOptions).toEqual([
      { stageNumber: 1, stageName: '' },
      { stageNumber: 2, stageName: '' },
    ]);
  });

  it('is undefined when the matches view is not served', async () => {
    serve({});
    expect(
      await loadSchedule({ organization: 'liga', tournament: 'apertura', state: 'all' }),
    ).toBeUndefined();
  });
});
