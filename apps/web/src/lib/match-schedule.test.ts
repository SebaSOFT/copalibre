import { describe, expect, it } from '@jest/globals';
import type { BracketMatch } from './bracket.js';
import {
  buildSchedule,
  defaultOpenStage,
  offersViewChoice,
  SCHEDULE_TABLE_THRESHOLD,
  type ScheduleStageInput,
} from './match-schedule.js';
import type { MatchCardData } from './matches-view.js';

const row = (
  overrides: Partial<MatchCardData> & Pick<MatchCardData, 'matchNumber'>,
): MatchCardData => ({
  matchId: `m-${overrides.matchNumber}`,
  stageNumber: 1,
  state: 'final',
  round: 1,
  ...overrides,
});

const cupBracket: readonly BracketMatch[] = [
  {
    matchNumber: 1,
    roundNumber: 1,
    branch: 'winners',
    state: 'final',
    slots: [
      { kind: 'entrant', name: 'A' },
      { kind: 'entrant', name: 'B' },
    ],
  },
];

describe('buildSchedule', () => {
  const stages: readonly ScheduleStageInput[] = [
    {
      stageNumber: 1,
      stageName: 'Groups',
      zones: [{ name: 'Groups', layout: 'grid', matches: [] }],
    },
    {
      stageNumber: 2,
      stageName: 'Cups',
      zones: [
        { name: 'Gold', layout: 'bracket', matches: cupBracket },
        { name: 'Silver', layout: 'bracket', matches: cupBracket },
      ],
    },
  ];
  const rows = [
    row({ matchNumber: 2, round: 2, zoneName: 'Groups', groupName: 'A' }),
    row({ matchNumber: 1, round: 1, zoneName: 'Groups', groupName: 'A' }),
    row({ matchNumber: 3, round: 1, zoneName: 'Groups', groupName: 'B' }),
    row({ matchNumber: 4, round: 1, stageNumber: 2, zoneName: 'Gold' }),
    row({ matchNumber: 5, round: 1, stageNumber: 2, zoneName: 'Silver' }),
  ];

  it('nests stage, zone, group and round, each round sorted and never shared across scopes', () => {
    const [groups] = buildSchedule({ stages, rows, knockoutAsBracket: true });
    const zone = groups?.zones[0];
    expect(zone?.kind).toBe('rows');
    if (zone?.kind !== 'rows') return;
    expect(zone.groups.map((one) => one.name)).toEqual(['A', 'B']);
    expect(zone.groups[0]?.rounds.map((one) => one.round)).toEqual([1, 2]);
    expect(zone.groups[1]?.rounds).toHaveLength(1);
  });

  it('draws a knockout zone as its bracket and does not list its matches as rows', () => {
    const cups = buildSchedule({ stages, rows, knockoutAsBracket: true })[1];
    expect(cups?.zones.map((zone) => zone.kind)).toEqual(['bracket', 'bracket']);
  });

  it('lists a knockout zone as rows once a state filter asks for a list of matches', () => {
    const cups = buildSchedule({ stages, rows, knockoutAsBracket: false })[1];
    expect(cups?.zones.map((zone) => zone.kind)).toEqual(['rows', 'rows']);
  });

  it('leaves out a stage or zone the filter emptied', () => {
    const only = rows.filter((one) => one.zoneName === 'Gold');
    const built = buildSchedule({ stages, rows: only, knockoutAsBracket: true });
    expect(built).toHaveLength(1);
    expect(built[0]?.zones.map((zone) => zone.name)).toEqual(['Gold']);
  });

  it('keeps rows whose zone the bracket projection does not declare', () => {
    const built = buildSchedule({
      stages: [{ stageNumber: 1, stageName: 'Groups', zones: [] }],
      rows: [row({ matchNumber: 1, zoneName: 'Orphan' })],
      knockoutAsBracket: true,
    });
    expect(built[0]?.zones[0]?.name).toBe('Orphan');
  });
});

describe('defaultOpenStage', () => {
  it('opens the stage with a live match first', () => {
    expect(
      defaultOpenStage(
        [
          { stageNumber: 1, state: 'upcoming' },
          { stageNumber: 2, state: 'live' },
        ],
        [1, 2],
      ),
    ).toBe(2);
  });

  it('opens the first stage that still has matches to play', () => {
    expect(
      defaultOpenStage(
        [
          { stageNumber: 1, state: 'final' },
          { stageNumber: 2, state: 'upcoming' },
        ],
        [1, 2],
      ),
    ).toBe(2);
  });

  it('opens none once everything is played', () => {
    expect(
      defaultOpenStage(
        [
          { stageNumber: 1, state: 'final' },
          { stageNumber: 2, state: 'final' },
        ],
        [1, 2],
      ),
    ).toBeUndefined();
  });
});

describe('offersViewChoice', () => {
  it('offers the choice only up to the threshold', () => {
    expect(offersViewChoice(SCHEDULE_TABLE_THRESHOLD)).toBe(true);
    expect(offersViewChoice(SCHEDULE_TABLE_THRESHOLD + 1)).toBe(false);
    expect(offersViewChoice(0)).toBe(false);
  });
});
