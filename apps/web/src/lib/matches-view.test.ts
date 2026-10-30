import {
  applyTemplate,
  distinctFacetValues,
  formatClock,
  groupMatchesByRound,
} from './matches-view.js';

describe('formatClock', () => {
  it('pads under a minute and lets minutes exceed 59', () => {
    expect(formatClock(46)).toBe('00:46');
    expect(formatClock(4726)).toBe('78:46');
  });

  it('floors a fractional second and clamps a negative one to zero', () => {
    expect(formatClock(90.9)).toBe('01:30');
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('applyTemplate', () => {
  it('substitutes every placeholder present in values', () => {
    expect(applyTemplate('{group} — position #{position}', { group: 'Grupo A', position: 2 })).toBe(
      'Grupo A — position #2',
    );
  });

  it('leaves a placeholder with no matching value untouched, rather than dropping it', () => {
    expect(applyTemplate('Elapsed time: {time}', {})).toBe('Elapsed time: {time}');
  });
});

describe('distinctFacetValues', () => {
  it('returns no values for a single implicit zone/group, so the caller renders no pill', () => {
    const rows = [
      { zoneName: undefined, groupName: undefined },
      { zoneName: undefined, groupName: undefined },
    ];
    expect(distinctFacetValues(rows, 'zoneName')).toEqual([]);
  });

  it('returns each distinct zone name once, in first-seen order', () => {
    const rows = [
      { zoneName: 'Copa de Oro', groupName: undefined },
      { zoneName: 'Copa de Plata', groupName: undefined },
      { zoneName: 'Copa de Oro', groupName: undefined },
      { zoneName: 'Copa de Bronce', groupName: undefined },
    ];
    expect(distinctFacetValues(rows, 'zoneName')).toEqual([
      'Copa de Oro',
      'Copa de Plata',
      'Copa de Bronce',
    ]);
  });

  it('uses the declared promotion-band order before appending undeclared zones', () => {
    const rows = [
      { zoneName: 'Bronze', groupName: undefined },
      { zoneName: 'Gold', groupName: undefined },
      { zoneName: 'Silver', groupName: undefined },
      { zoneName: 'Gold', groupName: undefined },
      { zoneName: 'Unlisted', groupName: undefined },
    ];

    expect(distinctFacetValues(rows, 'zoneName', ['Gold', 'Silver', 'Bronze'])).toEqual([
      'Gold',
      'Silver',
      'Bronze',
      'Unlisted',
    ]);
  });

  it('derives group options only from the rows passed in (a zone-filtered subset)', () => {
    const zoneFilteredRows = [
      { zoneName: 'Copa de Oro', groupName: 'Group A' },
      { zoneName: 'Copa de Oro', groupName: 'Group B' },
    ];
    expect(distinctFacetValues(zoneFilteredRows, 'groupName')).toEqual(['Group A', 'Group B']);
  });
});

describe('groupMatchesByRound', () => {
  it('groups by round ascending and sorts each round by match number', () => {
    const rows = [
      { round: 2, matchNumber: 2 },
      { round: 1, matchNumber: 2 },
      { round: 2, matchNumber: 1 },
      { round: 1, matchNumber: 1 },
    ];
    expect(groupMatchesByRound(rows)).toEqual([
      {
        round: 1,
        matches: [
          { round: 1, matchNumber: 1 },
          { round: 1, matchNumber: 2 },
        ],
      },
      {
        round: 2,
        matches: [
          { round: 2, matchNumber: 1 },
          { round: 2, matchNumber: 2 },
        ],
      },
    ]);
  });

  it('buckets a row with no round under round 0 rather than dropping it', () => {
    const rows = [{ round: undefined, matchNumber: 1 }];
    expect(groupMatchesByRound(rows)).toEqual([{ round: 0, matches: rows }]);
  });

  it('orders scheduled matches chronologically and leaves unscheduled matches afterward', () => {
    const rows = [
      { round: 1, matchNumber: 1, scheduledAt: '2026-10-22T00:15:00.000Z' },
      { round: 1, matchNumber: 2, scheduledAt: '2026-10-21T12:00:00.000Z' },
      { round: 1, matchNumber: 3 },
    ];

    expect(groupMatchesByRound(rows)[0]?.matches).toEqual([rows[1], rows[0], rows[2]]);
  });
});
