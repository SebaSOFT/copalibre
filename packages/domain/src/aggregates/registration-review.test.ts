import {
  canDecide,
  planBulkReview,
  planRosterReconciliation,
  statusFor,
  teamMembershipsApply,
  teamMembershipsEditable,
} from './registration-review.js';

const REQUIRED = { requiresCheckIn: true, closesAt: '2026-08-01T18:00:00.000Z' };

describe('when team memberships stop being editable', () => {
  it('locks a checked-in entrant once the window closes', () => {
    const result = teamMembershipsEditable(REQUIRED, 'checked-in', '2026-08-01T19:00:00.000Z');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('eligibility basis');
  });

  it('leaves it editable before the window closes', () => {
    expect(teamMembershipsEditable(REQUIRED, 'checked-in', '2026-08-01T17:00:00.000Z').ok).toBe(
      true,
    );
  });

  it('never locks a tournament that asked for no check-in', () => {
    // CopaLibre enforces what this organizer configured, not what a
    // competition usually does.
    expect(
      teamMembershipsEditable({ requiresCheckIn: false }, 'checked-in', '2027-01-01T00:00:00Z').ok,
    ).toBe(true);
  });

  it('never locks an entrant who has not checked in', () => {
    expect(teamMembershipsEditable(REQUIRED, 'accepted', '2026-08-01T19:00:00.000Z').ok).toBe(true);
  });

  it('never locks when no closing instant was set', () => {
    expect(
      teamMembershipsEditable({ requiresCheckIn: true }, 'checked-in', '2027-01-01T00:00:00Z').ok,
    ).toBe(true);
  });
});

describe('deciding a registration', () => {
  it('lets an organizer change their mind', () => {
    expect(canDecide('refused', 'accepted').ok).toBe(true);
    expect(canDecide('accepted', 'refused').ok).toBe(true);
    expect(statusFor('accepted')).toBe('accepted');
  });

  it('refuses to override a withdrawal', () => {
    // Overriding it puts somebody in a competition they left.
    const result = canDecide('withdrawn', 'accepted');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('only they can undo that');
  });

  it('lets a withdrawal be recorded again, which changes nothing', () => {
    expect(canDecide('withdrawn', 'withdrawn').ok).toBe(true);
  });
});

describe('a bulk action is a list of single decisions', () => {
  const entrants = [
    { entrantId: 'e-1', status: 'pending' as const },
    { entrantId: 'e-2', status: 'pending' as const },
    { entrantId: 'e-3', status: 'withdrawn' as const },
    { entrantId: 'e-4', status: 'pending' as const },
  ];

  it('applies to exactly what was selected', () => {
    const plan = planBulkReview(entrants, ['e-1', 'e-2'], 'accepted');

    expect(plan.apply.map((one) => one.entrantId)).toEqual(['e-1', 'e-2']);
    expect(plan.refused).toEqual([]);
  });

  it('reports the ones it will not touch, rather than silently skipping them', () => {
    // "Approved 40" is not an answer to "why is this team in the draw".
    const plan = planBulkReview(entrants, ['e-1', 'e-3'], 'accepted');

    expect(plan.apply).toHaveLength(1);
    expect(plan.refused[0]?.entrantId).toBe('e-3');
    expect(plan.refused[0]?.reason).toContain('withdrew');
  });

  it('ignores an id that is not in the list', () => {
    expect(planBulkReview(entrants, ['nope'], 'accepted').apply).toEqual([]);
  });
});

describe('a team-membership edit applies only to a team entrant', () => {
  it('refuses a person-kind entrant', () => {
    const result = teamMembershipsApply('person');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('only to a team entrant');
  });

  it('allows a team-kind entrant', () => {
    expect(teamMembershipsApply('team').ok).toBe(true);
  });
});

describe('reconciling a team-membership edit to the submitted set', () => {
  it('adds whoever is new and removes whoever was left out', () => {
    const plan = planRosterReconciliation(['p-1', 'p-2', 'p-3'], ['p-2', 'p-3', 'p-4']);

    expect(plan.toEnlist).toEqual(['p-4']);
    expect(plan.toRemove).toEqual(['p-1']);
  });

  it('changes nothing when the submitted set matches the current one', () => {
    const plan = planRosterReconciliation(['p-1', 'p-2'], ['p-2', 'p-1']);

    expect(plan.toEnlist).toEqual([]);
    expect(plan.toRemove).toEqual([]);
  });

  it('removes everyone for an empty submitted set', () => {
    const plan = planRosterReconciliation(['p-1', 'p-2'], []);

    expect(plan.toEnlist).toEqual([]);
    expect(plan.toRemove).toEqual(['p-1', 'p-2']);
  });

  it('adds everyone for an empty current set', () => {
    const plan = planRosterReconciliation([], ['p-1', 'p-2']);

    expect(plan.toEnlist).toEqual(['p-1', 'p-2']);
    expect(plan.toRemove).toEqual([]);
  });
});
