import { endsAt, gapMinutes, overlaps, type ResourceAssignment, type Venue } from './resource.js';
import {
  describeWindow,
  detectConflicts,
  ScheduleConflictError,
  type ScheduleContext,
  type SlotInfo,
} from './schedule-conflict.js';

/** 2026-08-01T14:00:00Z, and everything else expressed in minutes from there. */
const BASE = Date.UTC(2026, 7, 1, 14, 0, 0);
const at = (minutes: number) => BASE + minutes * 60_000;

const window = (startMinutes: number, durationMinutes = 60) => ({
  startsAt: at(startMinutes),
  durationMinutes,
});

const venue = (venueId: string, concurrentCapacity = 1): Venue => ({
  venueId,
  organizationId: 'org-1',
  alias: venueId,
  name: venueId,
  concurrentCapacity,
});

const slot = (
  slotId: string,
  venueId: string,
  startMinutes: number,
  durationMinutes = 60,
): SlotInfo => ({
  slotId,
  venueId,
  window: window(startMinutes, durationMinutes),
});

const defaultSlots = new Map<string, SlotInfo>([
  ['slot-court-1-0', slot('slot-court-1-0', 'court-1', 0, 60)],
  ['slot-court-1-10', slot('slot-court-1-10', 'court-1', 10, 60)],
  ['slot-court-1-15', slot('slot-court-1-15', 'court-1', 15, 60)],
  ['slot-court-1-30', slot('slot-court-1-30', 'court-1', 30, 60)],
  ['slot-court-1-60', slot('slot-court-1-60', 'court-1', 60, 60)],
  ['slot-court-1-80', slot('slot-court-1-80', 'court-1', 80, 60)],
  ['slot-court-1-90', slot('slot-court-1-90', 'court-1', 90, 60)],
  ['slot-court-2-0', slot('slot-court-2-0', 'court-2', 0, 60)],
  ['slot-court-2-10', slot('slot-court-2-10', 'court-2', 10, 60)],
  ['slot-court-2-30', slot('slot-court-2-30', 'court-2', 30, 60)],
  ['slot-court-2-80', slot('slot-court-2-80', 'court-2', 80, 60)],
  ['slot-club-0', slot('slot-club-0', 'club', 0, 60)],
]);

function context(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    existing: [],
    slots: defaultSlots,
    entrantsByMatch: new Map(),
    venues: new Map([['court-1', venue('court-1')]]),
    ...overrides,
  };
}

describe('time windows', () => {
  it('treats back-to-back matches as not overlapping', () => {
    // A match ending at 15:00 and one starting at 15:00 share a boundary and
    // no time, which is how an operator scheduling consecutively expects it.
    expect(overlaps(window(0), window(60))).toBe(false);
    expect(gapMinutes(window(0), window(60))).toBe(0);
  });

  it.each([
    [0, 30, true],
    [0, 59, true],
    [0, 60, false],
    [0, 120, false],
  ])('a 60-minute match at 0 and one at %i+%i overlaps: %s', (start, offset, expected) => {
    expect(overlaps(window(start), window(offset))).toBe(expected);
  });

  it('measures the gap between consecutive matches', () => {
    expect(gapMinutes(window(0), window(90))).toBe(30);
    // Order does not matter: a gap is a gap from either side.
    expect(gapMinutes(window(90), window(0))).toBe(30);
  });

  it('computes the end from the start and duration', () => {
    expect(endsAt(window(0, 45))).toBe(at(45));
  });
});

describe('venue double-booking', () => {
  it('accepts two overlapping matches at different venues', () => {
    const proposed: ResourceAssignment[] = [
      { matchId: 'm1', slotId: 'slot-court-1-0' },
      { matchId: 'm2', slotId: 'slot-court-2-0' },
    ];

    expect(
      detectConflicts(
        proposed,
        context({
          venues: new Map([
            ['court-1', venue('court-1')],
            ['court-2', venue('court-2')],
          ]),
        }),
      ),
    ).toEqual([]);
  });

  it('rejects two overlapping matches at a single-capacity venue', () => {
    const proposed: ResourceAssignment[] = [
      { matchId: 'm1', slotId: 'slot-court-1-0' },
      { matchId: 'm2', slotId: 'slot-court-1-30' },
    ];

    const conflicts = detectConflicts(proposed, context());
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: 'venue-double-booked',
      matchId: 'm1',
      conflictsWithMatchId: 'm2',
      resourceId: 'court-1',
    });
  });

  it('lets a three-court club host three at once and refuses the fourth', () => {
    const club = new Map([['club', venue('club', 3)]]);
    const existing: ResourceAssignment[] = [
      { matchId: 'a', slotId: 'slot-club-0' },
      { matchId: 'b', slotId: 'slot-club-0' },
    ];

    // Third overlapping match: still within capacity.
    expect(
      detectConflicts(
        [{ matchId: 'c', slotId: 'slot-club-0' }],
        context({ existing, venues: club }),
      ),
    ).toEqual([]);

    // Fourth: the conflict.
    const full = [...existing, { matchId: 'c', slotId: 'slot-club-0' }];
    const conflicts = detectConflicts(
      [{ matchId: 'd', slotId: 'slot-club-0' }],
      context({ existing: full, venues: club }),
    );
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]?.detail).toContain('hosts 3 match(es) at once');
  });

  it('catches a clash inside one batch, not only against committed state', () => {
    const conflicts = detectConflicts(
      [
        { matchId: 'm1', slotId: 'slot-court-1-0' },
        { matchId: 'm2', slotId: 'slot-court-1-15' },
      ],
      context(),
    );

    expect(conflicts).toHaveLength(1);
  });

  it('does not clash a match with its own committed version', () => {
    const conflicts = detectConflicts(
      [{ matchId: 'm1', slotId: 'slot-court-1-30' }],
      context({ existing: [{ matchId: 'm1', slotId: 'slot-court-1-0' }] }),
    );

    expect(conflicts).toEqual([]);
  });
});

describe('official double-booking', () => {
  it('rejects one official on two overlapping matches, wherever they are', () => {
    const conflicts = detectConflicts(
      [
        { matchId: 'm1', slotId: 'slot-court-1-0', officialIds: ['ref-1'] },
        { matchId: 'm2', slotId: 'slot-court-2-30', officialIds: ['ref-1'] },
      ],
      context({
        venues: new Map([
          ['court-1', venue('court-1')],
          ['court-2', venue('court-2')],
        ]),
      }),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'official-double-booked', resourceId: 'ref-1' });
  });

  it('accepts two matches in the same slot with different officials', () => {
    const club = new Map([['club', venue('club', 2)]]);
    expect(
      detectConflicts(
        [
          { matchId: 'm1', slotId: 'slot-club-0', officialIds: ['ref-1'] },
          { matchId: 'm2', slotId: 'slot-club-0', officialIds: ['ref-2'] },
        ],
        context({ venues: club }),
      ),
    ).toEqual([]);
  });

  it('accepts the same official on consecutive matches', () => {
    expect(
      detectConflicts(
        [
          { matchId: 'm1', slotId: 'slot-court-1-0', officialIds: ['ref-1'] },
          { matchId: 'm2', slotId: 'slot-court-1-60', officialIds: ['ref-1'] },
        ],
        context(),
      ),
    ).toEqual([]);
  });

  it('reports every clashing official rather than the first', () => {
    const conflicts = detectConflicts(
      [
        { matchId: 'm1', slotId: 'slot-court-1-0', officialIds: ['ref-1', 'ref-2'] },
        { matchId: 'm2', slotId: 'slot-court-2-10', officialIds: ['ref-1', 'ref-2'] },
      ],
      context({
        venues: new Map([
          ['court-1', venue('court-1')],
          ['court-2', venue('court-2')],
        ]),
      }),
    );

    expect(conflicts.map((conflict) => conflict.resourceId)).toEqual(['ref-1', 'ref-2']);
  });
});

/** The same tournament rule on every match these tests place. */
const restOf = (minutes: number) =>
  new Map(['m1', 'm2', 'm3'].map((matchId) => [matchId, minutes] as const));

describe('rest rules', () => {
  const entrants = new Map([
    ['m1', ['alfa', 'bravo']],
    ['m2', ['alfa', 'charlie']],
    ['m3', ['delta', 'echo']],
  ]);

  it('rejects a match that leaves an entrant less rest than required', () => {
    const conflicts = detectConflicts(
      [{ matchId: 'm2', slotId: 'slot-court-2-80' }],
      context({
        existing: [{ matchId: 'm1', slotId: 'slot-court-1-0' }],
        entrantsByMatch: entrants,
        venues: new Map([
          ['court-1', venue('court-1')],
          ['court-2', venue('court-2')],
        ]),
        restMinutesByMatch: restOf(30),
      }),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'rest-rule', resourceId: 'alfa' });
    expect(conflicts[0]?.detail).toContain('20 minute(s)');
  });

  it('accepts exactly the required rest', () => {
    expect(
      detectConflicts(
        [{ matchId: 'm2', slotId: 'slot-court-1-90' }],
        context({
          existing: [{ matchId: 'm1', slotId: 'slot-court-1-0' }],
          entrantsByMatch: entrants,
          restMinutesByMatch: restOf(30),
        }),
      ),
    ).toEqual([]);
  });

  it('says plainly when an entrant would play twice at once', () => {
    const conflicts = detectConflicts(
      [{ matchId: 'm2', slotId: 'slot-court-2-0' }],
      context({
        existing: [{ matchId: 'm1', slotId: 'slot-court-1-0' }],
        entrantsByMatch: entrants,
        venues: new Map([
          ['court-1', venue('court-1')],
          ['court-2', venue('court-2')],
        ]),
        restMinutesByMatch: restOf(30),
      }),
    );

    expect(conflicts[0]?.detail).toContain('at the same time');
  });

  it('ignores matches sharing no entrant', () => {
    expect(
      detectConflicts(
        [{ matchId: 'm3', slotId: 'slot-court-2-10' }],
        context({
          existing: [{ matchId: 'm1', slotId: 'slot-court-1-0' }],
          entrantsByMatch: entrants,
          venues: new Map([
            ['court-1', venue('court-1')],
            ['court-2', venue('court-2')],
          ]),
          restMinutesByMatch: restOf(120),
        }),
      ),
    ).toEqual([]);
  });

  it('is inert when the configuration declares no rest rule', () => {
    expect(
      detectConflicts(
        [{ matchId: 'm2', slotId: 'slot-court-2-10' }],
        context({
          existing: [{ matchId: 'm1', slotId: 'slot-court-1-0' }],
          entrantsByMatch: entrants,
          venues: new Map([
            ['court-1', venue('court-1')],
            ['court-2', venue('court-2')],
          ]),
        }),
      ),
    ).toEqual([]);
  });
});

describe('finalized-match protection', () => {
  it('refuses to reschedule a match that has already finalized', () => {
    const conflicts = detectConflicts(
      [{ matchId: 'm1', slotId: 'slot-court-1-30' }],
      context({ lockedMatches: new Map([['m1', 'finalized']]) }),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: 'match-finalized',
      matchId: 'm1',
      conflictsWithMatchId: 'm1',
      resourceId: 'm1',
    });
    expect(conflicts[0]?.detail).toContain('audited correction workflow');
  });

  it('leaves a match with no finalized status unaffected', () => {
    expect(
      detectConflicts(
        [{ matchId: 'm1', slotId: 'slot-court-1-0' }],
        context({ lockedMatches: new Map([['m2', 'finalized']]) }),
      ),
    ).toEqual([]);
  });
});

describe('occupancy windows', () => {
  /** 15-minute slots, as in a demo grid, every quarter hour on one court. */
  const quarterSlots = new Map<string, SlotInfo>(
    [0, 15, 30, 45, 60, 75, 90].map((minutes) => [
      `q-${minutes}`,
      slot(`q-${minutes}`, 'court-1', minutes, 15),
    ]),
  );

  it('rejects a venue clash short slots would hide, because the match occupies its estimate', () => {
    const conflicts = detectConflicts(
      [{ matchId: 'm2', slotId: 'q-15' }],
      context({
        slots: quarterSlots,
        existing: [{ matchId: 'm1', slotId: 'q-0' }],
        occupancyMinutesByMatch: new Map([
          ['m1', 50],
          ['m2', 50],
        ]),
      }),
    );
    expect(conflicts).toEqual([
      expect.objectContaining({ kind: 'venue-double-booked', conflictsWithMatchId: 'm1' }),
    ]);
  });

  it('holds the venue for the changeover after the match', () => {
    const occupancy = new Map([
      ['m1', 50],
      ['m2', 50],
    ]);
    const placeAt = (slotId: string, changeoverMinutes: number) =>
      detectConflicts(
        [{ matchId: 'm2', slotId }],
        context({
          slots: new Map(
            [...quarterSlots].map(([id, info]) => [id, { ...info, changeoverMinutes }]),
          ),
          existing: [{ matchId: 'm1', slotId: 'q-0' }],
          occupancyMinutesByMatch: occupancy,
        }),
      );
    expect(placeAt('q-60', 0)).toEqual([]);
    expect(placeAt('q-60', 15)).toEqual([expect.objectContaining({ kind: 'venue-double-booked' })]);
    expect(placeAt('q-75', 15)).toEqual([]);
  });

  it('measures rest from the estimated end, not the slot end', () => {
    // 09:00 start, 50-minute estimate, 60 minutes of rest required, next at 10:30: 40 minutes.
    const conflicts = detectConflicts(
      [{ matchId: 'm2', slotId: 'slot-court-2-80' }],
      context({
        slots: new Map([
          ['slot-court-1-0', slot('slot-court-1-0', 'court-1', 0, 120)],
          ['slot-court-2-80', slot('slot-court-2-80', 'court-2', 90, 120)],
        ]),
        existing: [{ matchId: 'm1', slotId: 'slot-court-1-0' }],
        entrantsByMatch: new Map([
          ['m1', ['alfa', 'bravo']],
          ['m2', ['alfa', 'charlie']],
        ]),
        venues: new Map([
          ['court-1', venue('court-1')],
          ['court-2', venue('court-2')],
        ]),
        occupancyMinutesByMatch: new Map([
          ['m1', 50],
          ['m2', 50],
        ]),
        restMinutesByMatch: restOf(60),
      }),
    );
    expect(conflicts).toEqual([expect.objectContaining({ kind: 'rest-rule', resourceId: 'alfa' })]);
    expect(conflicts[0]?.detail).toContain('40 minute(s)');
  });

  it('falls back to the slot length when a match has no estimate', () => {
    const conflicts = detectConflicts(
      [{ matchId: 'm2', slotId: 'slot-court-1-90' }],
      context({
        slots: new Map([
          ['slot-court-1-0', slot('slot-court-1-0', 'court-1', 0, 120)],
          ['slot-court-1-90', slot('slot-court-1-90', 'court-1', 90, 120)],
        ]),
        existing: [{ matchId: 'm1', slotId: 'slot-court-1-0' }],
      }),
    );
    expect(conflicts).toEqual([expect.objectContaining({ kind: 'venue-double-booked' })]);
  });

  it('applies the stricter of two tournaments rules', () => {
    const conflicts = detectConflicts(
      [{ matchId: 'm2', slotId: 'slot-court-2-80' }],
      context({
        existing: [{ matchId: 'm1', slotId: 'slot-court-1-0' }],
        entrantsByMatch: new Map([
          ['m1', ['alfa']],
          ['m2', ['alfa']],
        ]),
        venues: new Map([
          ['court-1', venue('court-1')],
          ['court-2', venue('court-2')],
        ]),
        // 20 minutes separate them: the second tournament's 30 is what refuses it.
        restMinutesByMatch: new Map([
          ['m1', 10],
          ['m2', 30],
        ]),
      }),
    );
    expect(conflicts).toEqual([expect.objectContaining({ kind: 'rest-rule' })]);
    expect(conflicts[0]?.detail).toContain('30 are required');
  });
});

describe('in-progress protection', () => {
  it('refuses to move a match in progress', () => {
    const conflicts = detectConflicts(
      [{ matchId: 'm1', slotId: 'slot-court-1-30' }],
      context({ lockedMatches: new Map([['m1', 'in-progress']]) }),
    );
    expect(conflicts).toEqual([
      expect.objectContaining({ kind: 'match-in-progress', matchId: 'm1', resourceId: 'm1' }),
    ]);
  });
});

describe('withdrawals', () => {
  it('frees the withdrawn match slot for another placement in the same batch', () => {
    expect(
      detectConflicts(
        [{ matchId: 'm2', slotId: 'slot-court-1-0' }],
        context({ existing: [{ matchId: 'm1', slotId: 'slot-court-1-0' }] }),
        ['m1'],
      ),
    ).toEqual([]);
  });

  it.each([
    ['finalized', 'match-finalized'],
    ['in-progress', 'match-in-progress'],
  ] as const)('refuses to withdraw a %s match', (lock, kind) => {
    expect(
      detectConflicts([], context({ lockedMatches: new Map([['m1', lock]]) }), ['m1']),
    ).toEqual([expect.objectContaining({ kind, matchId: 'm1' })]);
  });
});

describe('reporting conflicts', () => {
  it('summarises every conflict in one error an operator can act on', () => {
    const conflicts = detectConflicts(
      [
        { matchId: 'm1', slotId: 'slot-court-1-0' },
        { matchId: 'm2', slotId: 'slot-court-1-10' },
      ],
      context(),
    );
    const error = new ScheduleConflictError(conflicts);

    expect(error.code).toBe('SCHEDULE_CONFLICT');
    expect(error.message).toContain('1 conflict(s)');
    expect(error.message).toContain('court-1');
    expect(error.conflicts).toEqual(conflicts);
  });

  it('describes a window by its two ends, which is what a clash is about', () => {
    expect(describeWindow(window(0, 45))).toEqual({ start: at(0), end: at(45) });
  });
});
