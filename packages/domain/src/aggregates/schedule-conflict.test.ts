import { endsAt, gapMinutes, overlaps, type ResourceAssignment, type Venue } from './resource.js';
import {
  describeWindow,
  detectConflicts,
  ScheduleConflictError,
  type ScheduleContext,
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

function context(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    existing: [],
    entrantsByFixture: new Map(),
    venues: new Map([['court-1', venue('court-1')]]),
    ...overrides,
  };
}

describe('time windows', () => {
  it('treats back-to-back fixtures as not overlapping', () => {
    // A fixture ending at 15:00 and one starting at 15:00 share a boundary and
    // no time, which is how an operator scheduling consecutively expects it.
    expect(overlaps(window(0), window(60))).toBe(false);
    expect(gapMinutes(window(0), window(60))).toBe(0);
  });

  it.each([
    [0, 30, true],
    [0, 59, true],
    [0, 60, false],
    [0, 120, false],
  ])('a 60-minute fixture at 0 and one at %i+%i overlaps: %s', (start, offset, expected) => {
    expect(overlaps(window(start), window(offset))).toBe(expected);
  });

  it('measures the gap between consecutive fixtures', () => {
    expect(gapMinutes(window(0), window(90))).toBe(30);
    // Order does not matter: a gap is a gap from either side.
    expect(gapMinutes(window(90), window(0))).toBe(30);
  });

  it('computes the end from the start and duration', () => {
    expect(endsAt(window(0, 45))).toBe(at(45));
  });
});

describe('venue double-booking', () => {
  it('accepts two overlapping fixtures at different venues', () => {
    const proposed: ResourceAssignment[] = [
      { fixtureId: 'f1', window: window(0), venueId: 'court-1' },
      { fixtureId: 'f2', window: window(0), venueId: 'court-2' },
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

  it('rejects two overlapping fixtures at a single-capacity venue', () => {
    const proposed: ResourceAssignment[] = [
      { fixtureId: 'f1', window: window(0), venueId: 'court-1' },
      { fixtureId: 'f2', window: window(30), venueId: 'court-1' },
    ];

    const conflicts = detectConflicts(proposed, context());
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: 'venue-double-booked',
      fixtureId: 'f1',
      conflictsWithFixtureId: 'f2',
      resourceId: 'court-1',
    });
  });

  it('lets a three-court club host three at once and refuses the fourth', () => {
    const club = new Map([['club', venue('club', 3)]]);
    const existing: ResourceAssignment[] = [
      { fixtureId: 'a', window: window(0), venueId: 'club' },
      { fixtureId: 'b', window: window(0), venueId: 'club' },
    ];

    // Third overlapping fixture: still within capacity.
    expect(
      detectConflicts(
        [{ fixtureId: 'c', window: window(0), venueId: 'club' }],
        context({ existing, venues: club }),
      ),
    ).toEqual([]);

    // Fourth: the conflict.
    const full = [...existing, { fixtureId: 'c', window: window(0), venueId: 'club' }];
    const conflicts = detectConflicts(
      [{ fixtureId: 'd', window: window(0), venueId: 'club' }],
      context({ existing: full, venues: club }),
    );
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]?.detail).toContain('hosts 3 fixture(s) at once');
  });

  it('catches a clash inside one batch, not only against committed state', () => {
    // Two fixtures published together can double-book just as easily as one
    // published after the other.
    const conflicts = detectConflicts(
      [
        { fixtureId: 'f1', window: window(0), venueId: 'court-1' },
        { fixtureId: 'f2', window: window(15), venueId: 'court-1' },
      ],
      context(),
    );

    expect(conflicts).toHaveLength(1);
  });

  it('does not clash a fixture with its own committed version', () => {
    // Rescheduling f1 must not report f1 conflicting with f1.
    const conflicts = detectConflicts(
      [{ fixtureId: 'f1', window: window(30), venueId: 'court-1' }],
      context({ existing: [{ fixtureId: 'f1', window: window(0), venueId: 'court-1' }] }),
    );

    expect(conflicts).toEqual([]);
  });

  it('rejects a window that is not a window', () => {
    const conflicts = detectConflicts(
      [{ fixtureId: 'f1', window: { startsAt: at(0), durationMinutes: 0 }, venueId: 'court-1' }],
      context(),
    );

    expect(conflicts[0]?.detail).toContain('positive number of minutes');
  });
});

describe('official double-booking', () => {
  it('rejects one official on two overlapping fixtures, wherever they are', () => {
    const conflicts = detectConflicts(
      [
        { fixtureId: 'f1', window: window(0), venueId: 'court-1', officialIds: ['ref-1'] },
        { fixtureId: 'f2', window: window(30), venueId: 'court-2', officialIds: ['ref-1'] },
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

  it('accepts the same official on consecutive fixtures', () => {
    expect(
      detectConflicts(
        [
          { fixtureId: 'f1', window: window(0), officialIds: ['ref-1'] },
          { fixtureId: 'f2', window: window(60), officialIds: ['ref-1'] },
        ],
        context(),
      ),
    ).toEqual([]);
  });

  it('reports every clashing official rather than the first', () => {
    const conflicts = detectConflicts(
      [
        { fixtureId: 'f1', window: window(0), officialIds: ['ref-1', 'ref-2'] },
        { fixtureId: 'f2', window: window(10), officialIds: ['ref-1', 'ref-2'] },
      ],
      context(),
    );

    expect(conflicts.map((conflict) => conflict.resourceId)).toEqual(['ref-1', 'ref-2']);
  });

  it('ignores an official capacity setting, because a person has none', () => {
    // No venue involved at all: officials are checked without consulting one.
    const conflicts = detectConflicts(
      [
        { fixtureId: 'f1', window: window(0), officialIds: ['ref-1'] },
        { fixtureId: 'f2', window: window(0), officialIds: ['ref-1'] },
      ],
      context({ venues: new Map() }),
    );

    expect(conflicts).toHaveLength(1);
  });
});

describe('rest rules', () => {
  const entrants = new Map([
    ['f1', ['alfa', 'bravo']],
    ['f2', ['alfa', 'charlie']],
    ['f3', ['delta', 'echo']],
  ]);

  it('rejects a fixture that leaves an entrant less rest than required', () => {
    const conflicts = detectConflicts(
      [{ fixtureId: 'f2', window: window(80), venueId: 'court-2' }],
      context({
        existing: [{ fixtureId: 'f1', window: window(0), venueId: 'court-1' }],
        entrantsByFixture: entrants,
        restRule: { minimumMinutes: 30 },
      }),
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'rest-rule', resourceId: 'alfa' });
    expect(conflicts[0]?.detail).toContain('20 minute(s)');
  });

  it('accepts exactly the required rest', () => {
    expect(
      detectConflicts(
        [{ fixtureId: 'f2', window: window(90) }],
        context({
          existing: [{ fixtureId: 'f1', window: window(0) }],
          entrantsByFixture: entrants,
          restRule: { minimumMinutes: 30 },
        }),
      ),
    ).toEqual([]);
  });

  it('says plainly when an entrant would play twice at once', () => {
    const conflicts = detectConflicts(
      [{ fixtureId: 'f2', window: window(0), venueId: 'court-2' }],
      context({
        existing: [{ fixtureId: 'f1', window: window(0), venueId: 'court-1' }],
        entrantsByFixture: entrants,
        restRule: { minimumMinutes: 30 },
      }),
    );

    expect(conflicts[0]?.detail).toContain('at the same time');
  });

  it('ignores fixtures sharing no entrant', () => {
    expect(
      detectConflicts(
        [{ fixtureId: 'f3', window: window(10) }],
        context({
          existing: [{ fixtureId: 'f1', window: window(0) }],
          entrantsByFixture: entrants,
          restRule: { minimumMinutes: 120 },
        }),
      ),
    ).toEqual([]);
  });

  it('is inert when the configuration declares no rest rule', () => {
    expect(
      detectConflicts(
        [{ fixtureId: 'f2', window: window(1) }],
        context({
          existing: [{ fixtureId: 'f1', window: window(0) }],
          entrantsByFixture: entrants,
        }),
      ),
    ).toEqual([]);
  });
});

describe('a batch with several kinds of conflict', () => {
  it('reports all of them, so an operator fixes the schedule once', () => {
    const conflicts = detectConflicts(
      [
        { fixtureId: 'f1', window: window(0), venueId: 'court-1', officialIds: ['ref-1'] },
        { fixtureId: 'f2', window: window(10), venueId: 'court-1', officialIds: ['ref-1'] },
      ],
      context({
        entrantsByFixture: new Map([
          ['f1', ['alfa']],
          ['f2', ['alfa']],
        ]),
        restRule: { minimumMinutes: 30 },
      }),
    );

    expect(conflicts.map((conflict) => conflict.kind).sort()).toEqual([
      'official-double-booked',
      'rest-rule',
      'venue-double-booked',
    ]);
  });
});

describe('reporting conflicts', () => {
  it('summarises every conflict in one error an operator can act on', () => {
    const conflicts = detectConflicts(
      [
        { fixtureId: 'f1', window: window(0), venueId: 'court-1' },
        { fixtureId: 'f2', window: window(10), venueId: 'court-1' },
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
